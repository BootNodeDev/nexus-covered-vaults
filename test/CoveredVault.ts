import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const vaultName = "USDC Covered Vault";
const vaultSymbol = "cvUSDC";

describe("CoveredVault", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployVaultFixture() {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const ERC4626Mock = await ethers.getContractFactory("ERC4626Mock");
    const CoveredVault = await ethers.getContractFactory("CoveredVault");
    const CoveredVaultFactory = await ethers.getContractFactory("CoveredVaultFactory");

    const underlyingAsset = await ERC20Mock.deploy("USDC", "USDC");
    const underlyingVault = await ERC4626Mock.deploy(underlyingAsset.address, "USDC Invest Vault", "ivUSDC");
    const vaultFactory = await CoveredVaultFactory.deploy();

    let vaultAddress: string = "";
    await expect(vaultFactory.create(underlyingVault.address, vaultName, vaultSymbol))
      .to.emit(vaultFactory, "CoveredVaultCreated")
      .withArgs((createdAddress: string) => {
        vaultAddress = createdAddress;
        return true;
      });
    const vault = CoveredVault.attach(vaultAddress);

    const [owner, user1, user2] = await ethers.getSigners();

    return { vault, underlyingVault, underlyingAsset, owner, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should correctly set params", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);

      // covered vault properties
      expect(await vault.underlyingVault()).to.equal(underlyingVault.address);
      // erc4626 properties
      expect(await vault.asset()).to.equal(underlyingAsset.address);
      // erc20 properties
      expect(await vault.name()).to.equal(vaultName);
      expect(await vault.symbol()).to.equal(vaultSymbol);
      expect(await vault.decimals()).to.equal(await underlyingAsset.decimals());
    });
  });

  describe("totalAssets", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset, user1 } = await loadFixture(deployVaultFixture);

      expect(await vault.totalAssets()).to.equal(0);

      // Mint assets to user
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("1000"));

      // Deposit assets into vault
      await underlyingAsset.connect(user1).approve(vault.address, ethers.utils.parseEther("500"));
      await vault.connect(user1)["deposit(uint256,address)"](ethers.utils.parseEther("500"), user1.address);

      expect(await vault.totalAssets()).to.equal(ethers.utils.parseEther("500"));

      // Deposit assets into underlying vault to the vault account
      await underlyingAsset.connect(user1).approve(underlyingVault.address, ethers.utils.parseEther("500"));
      await underlyingVault.connect(user1).deposit(ethers.utils.parseEther("500"), vault.address);

      expect(await vault.totalAssets()).to.equal(ethers.utils.parseEther("1000"));

      // Mint to the vault
      await underlyingAsset.mint(vault.address, ethers.utils.parseEther("1000"));
      expect(await vault.totalAssets()).to.equal(ethers.utils.parseEther("2000"));

      // Mint to the underlying vault. This should increase the value of the underlying shares
      await underlyingAsset.mint(underlyingVault.address, ethers.utils.parseEther("1000"));
      expect(await vault.totalAssets()).to.equal(ethers.utils.parseEther("3000"));
    });
  });

  describe("convertToShares", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset, user1 } = await loadFixture(deployVaultFixture);

      // Mint assets to user and deposit
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("2000"));
      await underlyingAsset.connect(user1).approve(vault.address, ethers.utils.parseEther("1000"));
      await vault.connect(user1)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), user1.address);

      const assets = ethers.utils.parseEther("1000");

      // 1:1 rate
      expect(await vault.convertToShares(assets)).to.equal(assets);

      // Mint assets to vault
      await underlyingAsset.mint(vault.address, ethers.utils.parseEther("1000"));

      // 1:2 rate
      expect(await vault.convertToShares(assets)).to.equal(assets.div(2));

      // Deposit assets into underlying vault to the vault account
      await underlyingAsset.connect(user1).approve(underlyingVault.address, ethers.utils.parseEther("1000"));
      await underlyingVault.connect(user1).deposit(ethers.utils.parseEther("1000"), vault.address);

      // 1:3 rate
      expect(await vault.convertToShares(assets)).to.equal(assets.div(3));

      // Mint assets to underlying vault
      await underlyingAsset.mint(underlyingVault.address, ethers.utils.parseEther("1000"));

      // 1:4 rate
      expect(await vault.convertToShares(assets)).to.equal(assets.div(4));
    });
  });

  describe("convertToAssets", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset, user1 } = await loadFixture(deployVaultFixture);

      // Mint assets to user and deposit
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("2000"));
      await underlyingAsset.connect(user1).approve(vault.address, ethers.utils.parseEther("1000"));
      await vault.connect(user1)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), user1.address);

      const shares = ethers.utils.parseEther("1000");

      // 1:1 rate
      expect(await vault.convertToAssets(shares)).to.equal(shares);

      // Mint assets to vault
      await underlyingAsset.mint(vault.address, ethers.utils.parseEther("1000"));

      // 1:2 rate
      expect(await vault.convertToAssets(shares)).to.equal(shares.mul(2));

      // Deposit assets into underlying vault to the vault account
      await underlyingAsset.connect(user1).approve(underlyingVault.address, ethers.utils.parseEther("1000"));
      await underlyingVault.connect(user1).deposit(ethers.utils.parseEther("1000"), vault.address);

      // 1:3 rate
      expect(await vault.convertToAssets(shares)).to.equal(shares.mul(3));

      // Mint assets to underlying vault
      await underlyingAsset.mint(underlyingVault.address, ethers.utils.parseEther("1000"));

      // 1:4 rate
      expect(await vault.convertToAssets(shares)).to.equal(shares.mul(4));
    });
  });

  describe("previewDeposit", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset, user1 } = await loadFixture(deployVaultFixture);

      // Mint assets to user and deposit
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("2000"));
      await underlyingAsset.connect(user1).approve(vault.address, ethers.utils.parseEther("1000"));
      await vault.connect(user1)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), user1.address);

      const depositAssets = ethers.utils.parseEther("1000");

      // 1:1 rate
      expect(await vault.previewDeposit(depositAssets)).to.equal(depositAssets);

      // Mint assets to vault
      await underlyingAsset.mint(vault.address, ethers.utils.parseEther("1000"));

      // 1:2 rate
      expect(await vault.previewDeposit(depositAssets)).to.equal(depositAssets.div(2));

      // Deposit assets into underlying vault to the vault account
      await underlyingAsset.connect(user1).approve(underlyingVault.address, ethers.utils.parseEther("1000"));
      await underlyingVault.connect(user1).deposit(ethers.utils.parseEther("1000"), vault.address);

      // 1:3 rate
      expect(await vault.previewDeposit(depositAssets)).to.equal(depositAssets.div(3));

      // Mint assets to underlying vault
      await underlyingAsset.mint(underlyingVault.address, ethers.utils.parseEther("1000"));

      // 1:4 rate
      expect(await vault.previewDeposit(depositAssets)).to.equal(depositAssets.div(4));
    });
  });

  describe("deposit", function () {
    it("Should account for assets in the vault", async function () {
      const { vault, underlyingAsset, user1, user2 } = await loadFixture(deployVaultFixture);

      // Mint assets to user and deposit
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("2000"));
      await underlyingAsset.mint(user2.address, ethers.utils.parseEther("10000"));
      await underlyingAsset.connect(user1).approve(vault.address, ethers.utils.parseEther("1000"));
      await underlyingAsset.connect(user2).approve(vault.address, ethers.utils.parseEther("10000"));

      await vault.connect(user1)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), user1.address);

      const depositAssets = ethers.utils.parseEther("1000");

      const initialShares = await vault.balanceOf(user2.address);

      await vault.connect(user2)["deposit(uint256,address)"](depositAssets, user2.address);

      const firstDepositShares = await vault.balanceOf(user2.address);

      // 1:1 rate
      expect(firstDepositShares).to.equal(initialShares.add(depositAssets));

      // Mint assets to vault
      await underlyingAsset.mint(vault.address, ethers.utils.parseEther("1000"));

      await vault.connect(user2)["deposit(uint256,address)"](depositAssets, user2.address);
      const secondDepositShares = await vault.balanceOf(user2.address);

      // 1:2/3 rate
      expect(secondDepositShares).to.equal(firstDepositShares.add(depositAssets.mul(2).div(3)));
    });

    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset, user1, user2 } = await loadFixture(deployVaultFixture);

      // Mint assets to user and deposit
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("2000"));
      await underlyingAsset.mint(user2.address, ethers.utils.parseEther("10000"));
      await underlyingAsset.connect(user1).approve(vault.address, ethers.utils.parseEther("1000"));
      await underlyingAsset.connect(user2).approve(vault.address, ethers.utils.parseEther("10000"));

      await vault.connect(user1)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), user1.address);
      // Deposit assets into underlying vault to the vault account
      await underlyingAsset.connect(user1).approve(underlyingVault.address, ethers.utils.parseEther("1000"));
      await underlyingVault.connect(user1).deposit(ethers.utils.parseEther("1000"), vault.address);

      const depositAssets = ethers.utils.parseEther("1000");

      const initialShares = await vault.balanceOf(user2.address);

      await vault.connect(user2)["deposit(uint256,address)"](depositAssets, user2.address);

      const firstDepositShares = await vault.balanceOf(user2.address);

      // 1:1/2 rate
      expect(firstDepositShares).to.equal(initialShares.add(depositAssets.div(2)));
    });
  });

  describe("previewMint", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset, user1 } = await loadFixture(deployVaultFixture);

      // Mint assets to user and deposit
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("2000"));
      await underlyingAsset.connect(user1).approve(vault.address, ethers.utils.parseEther("1000"));
      await vault.connect(user1)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), user1.address);

      const mintShares = ethers.utils.parseEther("1000");

      // 1:1 rate
      expect(await vault.previewMint(mintShares)).to.equal(mintShares);

      // Mint assets to vault
      await underlyingAsset.mint(vault.address, ethers.utils.parseEther("1000"));

      // 1:2 rate
      expect(await vault.previewMint(mintShares)).to.equal(mintShares.mul(2));

      // Deposit assets into underlying vault to the vault account
      await underlyingAsset.connect(user1).approve(underlyingVault.address, ethers.utils.parseEther("1000"));
      await underlyingVault.connect(user1).deposit(ethers.utils.parseEther("1000"), vault.address);

      // 1:3 rate
      expect(await vault.previewMint(mintShares)).to.equal(mintShares.mul(3));

      // Mint assets to underlying vault
      await underlyingAsset.mint(underlyingVault.address, ethers.utils.parseEther("1000"));

      // 1:4 rate
      expect(await vault.previewMint(mintShares)).to.equal(mintShares.mul(4));
    });
  });

  describe("mint", function () {
    it("Should account for assets in the vault", async function () {
      const { vault, underlyingAsset, user1, user2 } = await loadFixture(deployVaultFixture);

      // Mint assets to user and deposit
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("2000"));
      await underlyingAsset.mint(user2.address, ethers.utils.parseEther("10000"));
      await underlyingAsset.connect(user1).approve(vault.address, ethers.utils.parseEther("1000"));
      await underlyingAsset.connect(user2).approve(vault.address, ethers.utils.parseEther("10000"));

      await vault.connect(user1)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), user1.address);

      const mintShares = ethers.utils.parseEther("1000");

      const initialAssets = await underlyingAsset.balanceOf(user2.address);

      await vault.connect(user2)["mint(uint256,address)"](mintShares, user2.address);

      const firstDepositAssets = await underlyingAsset.balanceOf(user2.address);

      // 1:1 rate
      expect(firstDepositAssets).to.equal(initialAssets.sub(mintShares));

      // Mint assets to vault
      await underlyingAsset.mint(vault.address, ethers.utils.parseEther("1000"));

      await vault.connect(user2)["mint(uint256,address)"](mintShares, user2.address);
      const secondDepositAssets = await underlyingAsset.balanceOf(user2.address);

      // 1:3/2 rate
      expect(secondDepositAssets).to.equal(firstDepositAssets.sub(mintShares.mul(3).div(2)));
    });

    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset, user1, user2 } = await loadFixture(deployVaultFixture);

      // Mint assets to user and deposit
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("2000"));
      await underlyingAsset.mint(user2.address, ethers.utils.parseEther("10000"));
      await underlyingAsset.connect(user1).approve(vault.address, ethers.utils.parseEther("1000"));
      await underlyingAsset.connect(user2).approve(vault.address, ethers.utils.parseEther("10000"));

      await vault.connect(user1)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), user1.address);
      // Deposit assets into underlying vault to the vault account
      await underlyingAsset.connect(user1).approve(underlyingVault.address, ethers.utils.parseEther("1000"));
      await underlyingVault.connect(user1).deposit(ethers.utils.parseEther("1000"), vault.address);

      const mintShares = ethers.utils.parseEther("1000");

      const initialAssets = await underlyingAsset.balanceOf(user2.address);

      await vault.connect(user2)["mint(uint256,address)"](mintShares, user2.address);

      const firstDepositAssets = await underlyingAsset.balanceOf(user2.address);

      // 1:2 rate
      expect(firstDepositAssets).to.equal(initialAssets.sub(mintShares.mul(2)));
    });
  });

  describe("ERC-5143", function () {
    it("Should not revert on deposit with shares = assets the first time", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const amount = ethers.BigNumber.from("100000");

      const [addr0] = await ethers.getSigners();
      const originalUserShares = await vault.balanceOf(addr0.address);

      await underlyingAsset.mint(addr0.address, amount);
      const originalUserAssets = await underlyingAsset.balanceOf(addr0.address);

      await underlyingAsset.approve(vault.address, amount);
      expect(await underlyingAsset.balanceOf(addr0.address)).to.equal(amount);

      await vault.connect(addr0)["deposit(uint256,address,uint256)"](amount, addr0.address, amount);

      expect(await vault.balanceOf(addr0.address)).to.equal(originalUserShares.add(amount));
      expect(await underlyingAsset.balanceOf(addr0.address)).to.equal(originalUserAssets.sub(amount));
    });

    it("Should revert on deposit with shares < minShares", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const amount = "100000";

      const [addr0] = await ethers.getSigners();
      await underlyingAsset.mint(addr0.address, amount);

      await underlyingAsset.approve(vault.address, amount);

      await expect(
        vault.connect(addr0)["deposit(uint256,address,uint256)"](amount, addr0.address, "100001"),
      ).to.be.revertedWithCustomError(vault, "CoveredVault__DepositSlippage");
    });

    it("Should not revert on mint with assets = shares the first time", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const amount = ethers.BigNumber.from("100000");

      const [addr0] = await ethers.getSigners();
      const originalUserShares = await vault.balanceOf(addr0.address);

      await underlyingAsset.mint(addr0.address, amount);
      const originalUserAssets = await underlyingAsset.balanceOf(addr0.address);

      await underlyingAsset.approve(vault.address, amount);
      await vault.connect(addr0)["mint(uint256,address,uint256)"](amount, addr0.address, amount);

      expect(await vault.balanceOf(addr0.address)).to.equal(originalUserShares.add(amount));
      expect(await underlyingAsset.balanceOf(addr0.address)).to.equal(originalUserAssets.sub(amount));
    });

    it("Should revert on mint with assets > maxShares", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const amount = "100000";

      const [addr0] = await ethers.getSigners();
      await underlyingAsset.mint(addr0.address, amount);

      await underlyingAsset.approve(vault.address, amount);
      await expect(
        vault.connect(addr0)["mint(uint256,address,uint256)"](amount, addr0.address, "99999"),
      ).to.be.revertedWithCustomError(vault, "CoveredVault__MintSlippage");
    });

    it("Should not revert on withdraw with shares = maxShares", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const amount = ethers.BigNumber.from("100000");

      const [addr0] = await ethers.getSigners();

      await underlyingAsset.mint(addr0.address, amount);
      const originalUserAssets = await underlyingAsset.balanceOf(addr0.address);

      await underlyingAsset.approve(vault.address, amount);
      await vault.connect(addr0)["mint(uint256,address,uint256)"](amount, addr0.address, amount);
      const originalUserShares = await vault.balanceOf(addr0.address);

      await vault
        .connect(addr0)
        ["withdraw(uint256,address,address,uint256)"](amount, addr0.address, addr0.address, amount);
      expect(await vault.balanceOf(addr0.address)).to.equal(originalUserShares.sub(amount));
      expect(await underlyingAsset.balanceOf(addr0.address)).to.equal(originalUserAssets); // same amount after mint
    });

    it("Should revert on withdraw with shares > maxShares", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const amount = "100000";

      const [addr0] = await ethers.getSigners();
      await underlyingAsset.mint(addr0.address, amount);

      await underlyingAsset.approve(vault.address, amount);
      await vault.connect(addr0)["mint(uint256,address,uint256)"](amount, addr0.address, amount);
      await expect(
        vault
          .connect(addr0)
          ["withdraw(uint256,address,address,uint256)"](amount, addr0.address, addr0.address, "99999"),
      ).to.be.revertedWithCustomError(vault, "CoveredVault__WithdrawSlippage");
    });

    it("Should not revert on redeem with assets = minAssets", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const amount = ethers.BigNumber.from("100000");

      const [addr0] = await ethers.getSigners();

      await underlyingAsset.mint(addr0.address, amount);
      const originalUserAssets = await underlyingAsset.balanceOf(addr0.address);

      await underlyingAsset.approve(vault.address, amount);
      await vault.connect(addr0)["mint(uint256,address,uint256)"](amount, addr0.address, amount);
      const originalUserShares = await vault.balanceOf(addr0.address);

      await vault
        .connect(addr0)
        ["redeem(uint256,address,address,uint256)"](amount, addr0.address, addr0.address, amount);

      expect(await vault.balanceOf(addr0.address)).to.equal(originalUserShares.sub(amount));
      expect(await underlyingAsset.balanceOf(addr0.address)).to.equal(originalUserAssets);
    });

    it("Should revert on redeem with assets < minAssets", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const amount = "100000";

      const [addr0] = await ethers.getSigners();
      await underlyingAsset.mint(addr0.address, amount);

      await underlyingAsset.approve(vault.address, amount);
      await vault.connect(addr0)["mint(uint256,address,uint256)"](amount, addr0.address, amount);
      await expect(
        vault.connect(addr0)["redeem(uint256,address,address,uint256)"](amount, addr0.address, addr0.address, "100001"),
      ).to.be.revertedWithCustomError(vault, "CoveredVault__RedeemSlippage");
    });
  });
});
