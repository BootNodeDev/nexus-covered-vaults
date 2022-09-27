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

  describe("Pausable", function () {
    it("Should be able to pause only by admin", async function () {
      const { vault } = await loadFixture(deployVaultFixture);

      const [botUser, anyUser, , admin] = await ethers.getSigners();
      await vault.connect(admin).grantRole(vault.BOT_ROLE(), botUser.address);

      await expect(vault.connect(botUser).pause()).to.be.reverted;
      await expect(vault.connect(anyUser).pause()).to.be.reverted;
      await expect(vault.connect(admin).pause()).to.not.be.reverted.and.be.eq(true);
    });

    it("Should be able to unpause when paused only by admin", async function () {
      const { vault } = await loadFixture(deployVaultFixture);

      const [botUser, anyUser, , admin] = await ethers.getSigners();
      await vault.connect(admin).grantRole(vault.BOT_ROLE(), botUser.address);
      await vault.connect(admin).pause();

      await expect(vault.connect(botUser).unpause()).to.be.reverted;
      await expect(vault.connect(anyUser).unpause()).to.be.reverted;
      await expect(await vault.connect(admin).unpause()).to.not.be.reverted.and.be.eq(false);
    });

    it("Should revert calls to redeem/withdraw/deposit/mint when paused", async function () {
      const amount = "100000";
      const pausedError = "Pausable: paused";

      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);

      const [anyUser, , , admin] = await ethers.getSigners();

      await vault.connect(admin).pause();

      // Mint assets
      await underlyingAsset.mint(anyUser.address, ethers.utils.parseEther(amount));
      await underlyingAsset.mint(admin.address, ethers.utils.parseEther(amount));

      // Approve for both vaults
      await underlyingAsset.connect(anyUser).approve(vault.address, ethers.utils.parseEther(amount));
      await underlyingAsset.connect(admin).approve(vault.address, ethers.utils.parseEther(amount));

      await underlyingAsset.connect(anyUser).approve(underlyingVault.address, ethers.utils.parseEther(amount));
      await underlyingAsset.connect(admin).approve(underlyingVault.address, ethers.utils.parseEther(amount));

      // check underlying vault deposit fails with admin-nonAdmin when paused
      await expect(
        vault.connect(anyUser)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), anyUser.address),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault.connect(admin)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), anyUser.address),
      ).to.be.revertedWith(pausedError);

      // check vault deposit fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["deposit(uint256,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["deposit(uint256,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);

      // check underlying vault mint fails with admin-nonAdmin when paused
      await expect(
        vault.connect(anyUser)["mint(uint256,address)"](ethers.utils.parseEther("1000"), anyUser.address),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault.connect(admin)["mint(uint256,address)"](ethers.utils.parseEther("1000"), anyUser.address),
      ).to.be.revertedWith(pausedError);

      // check vault mint fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["mint(uint256,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["mint(uint256,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);

      // check underlying vault redeem fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["redeem(uint256,address,address)"](ethers.utils.parseEther("1000"), anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["redeem(uint256,address,address)"](ethers.utils.parseEther("1000"), anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);

      // check vault redeem fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["redeem(uint256,address,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["redeem(uint256,address,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);

      // check underlying vault withdraw fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["withdraw(uint256,address,address)"](ethers.utils.parseEther("1000"), anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["withdraw(uint256,address,address)"](ethers.utils.parseEther("1000"), anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);

      // check vault withdraw fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["withdraw(uint256,address,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["withdraw(uint256,address,address,uint256)"](
            ethers.utils.parseEther("1000"),
            anyUser.address,
            anyUser.address,
            ethers.utils.parseEther("10"),
          ),
      ).to.be.revertedWith(pausedError);
    });
  });
});
