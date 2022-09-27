import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { deployVaultFixture } from "./utils/fixtures";
import { getPermitSignature } from "./utils/getPermitSignature";

const vaultName = "USDC Covered Vault";
const vaultSymbol = "cvUSDC";

describe("CoveredVault", function () {
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
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

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
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

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
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

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
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

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
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, user2] = await ethers.getSigners();

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
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, user2] = await ethers.getSigners();

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
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1] = await ethers.getSigners();

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
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, user2] = await ethers.getSigners();

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
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, user2] = await ethers.getSigners();

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

  describe("ERC20Permit", function () {
    it("Should give allowance to spender using signature", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const value = 123;

      const [wallet, spender] = await ethers.getSigners();
      const { v, r, s } = await getPermitSignature(wallet, vault, spender.address, value);

      expect(await vault.allowance(wallet.address, spender.address)).to.be.eq(0);
      await vault.permit(wallet.address, spender.address, value, constants.MaxUint256, v, r, s);
      expect(await vault.allowance(wallet.address, spender.address)).to.be.eq(value);
    });
  });

  describe("Access Control", function () {
    it("Should give admin rights to admin passed at construction time", async function () {
      const { vault } = await loadFixture(deployVaultFixture);

      const [user1, , , admin] = await ethers.getSigners();

      expect(await vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin.address)).to.equals(true);
      expect(await vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), user1.address)).to.equals(false);

      await vault.connect(admin).grantRole(vault.BOT_ROLE(), user1.address);

      expect(await vault.hasRole(vault.BOT_ROLE(), user1.address)).to.equals(true);
      expect(await vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), user1.address)).to.equals(false);
    });
  });

  describe("invest", function () {
    it("Should revert if not admin or bot", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to user and deposit
      await underlyingAsset.mint(vault.address, amount);

      await expect(vault.connect(user1).invest(amount.div(2))).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${await vault.BOT_ROLE()}`,
      );

      await vault.connect(admin).grantRole(await vault.BOT_ROLE(), user1.address);

      await vault.connect(user1).invest(amount.div(2));
      await vault.connect(admin).invest(amount.div(2));
    });

    it("Should allow to invest all idle assets into the underlying vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to user and deposit
      await underlyingAsset.mint(vault.address, amount);

      await expect(vault.connect(admin).invest(amount)).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [amount.mul(-1), amount],
      );
    });

    it("Should allow to invest some idle assets into the underlying vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to user and deposit
      await underlyingAsset.mint(vault.address, amount);

      await expect(vault.connect(admin).invest(amount.div(2))).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [amount.div(2).mul(-1), amount.div(2)],
      );
    });

    it("Should revert if trying to invest more assets that the vault has", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("1000");
      // Mint assets to user and deposit
      await underlyingAsset.mint(vault.address, amount);

      await expect(vault.connect(admin).invest(amount.mul(2))).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance",
      );
    });
  });
});
