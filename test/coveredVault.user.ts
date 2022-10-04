import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { deployVaultFixture, mintVaultSharesFixture } from "./utils/fixtures";
import { getPermitSignature } from "./utils/getPermitSignature";

describe("CoveredVault", function () {
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

  describe("maxDeposit", function () {
    it("Should account for max asset limit and total assets", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      expect(await vault.maxDeposit(user1.address)).to.equal(constants.MaxUint256);

      // Mint assets to user and deposit
      const mintAmount = ethers.utils.parseEther("10000");
      await underlyingAsset.mint(user1.address, mintAmount);
      await underlyingAsset.connect(user1).approve(vault.address, mintAmount);

      const depositAmount = ethers.utils.parseEther("1000");
      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

      expect(await vault.maxDeposit(user1.address)).to.equal(constants.MaxUint256.sub(depositAmount));

      await vault.connect(admin).invest(depositAmount);
      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);
      expect(await vault.maxDeposit(user1.address)).to.equal(constants.MaxUint256.sub(depositAmount.mul(2)));

      await vault.connect(admin).setMaxAssetsLimit(depositAmount.mul(2));
      expect(await vault.maxDeposit(user1.address)).to.equal(0);

      await vault.connect(user1)["withdraw(uint256,address,address)"](depositAmount, user1.address, user1.address);
      expect(await vault.maxDeposit(user1.address)).to.equal(depositAmount);
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

  describe("maxMint", function () {
    it("Should account for max asset limit and total assets", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      expect(await vault.maxDeposit(user1.address)).to.equal(constants.MaxUint256);

      // Mint assets to user and deposit
      const mintAmount = ethers.utils.parseEther("10000");
      await underlyingAsset.mint(user1.address, mintAmount);
      await underlyingAsset.connect(user1).approve(vault.address, mintAmount);

      const depositAmount = ethers.utils.parseEther("1000");
      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

      expect(await vault.maxMint(user1.address)).to.equal(constants.MaxUint256.sub(depositAmount));

      await vault.connect(admin).invest(depositAmount);
      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);
      expect(await vault.maxMint(user1.address)).to.equal(constants.MaxUint256.sub(depositAmount.mul(2)));

      await vault.connect(admin).setMaxAssetsLimit(depositAmount.mul(2));
      expect(await vault.maxMint(user1.address)).to.equal(0);

      await vault.connect(user1)["withdraw(uint256,address,address)"](depositAmount, user1.address, user1.address);
      expect(await vault.maxMint(user1.address)).to.equal(depositAmount);
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

    it("Should account for max deposit", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const depositAmount = ethers.utils.parseEther("1000");

      // Set max assets limit
      await vault.connect(admin).setMaxAssetsLimit(depositAmount.mul(2));

      // Mint assets to user and deposit
      const mintAmount = ethers.utils.parseEther("10000");
      await underlyingAsset.mint(user1.address, mintAmount);
      await underlyingAsset.connect(user1).approve(vault.address, mintAmount);

      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);
      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

      await expect(
        vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address),
      ).to.be.revertedWithCustomError(vault, "BaseERC4626__DepositMoreThanMax");
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

    it("Should account for max mint", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const depositAmount = ethers.utils.parseEther("1000");

      // Set max assets limit
      await vault.connect(admin).setMaxAssetsLimit(depositAmount.mul(2));

      // Mint assets to user and deposit
      const mintAmount = ethers.utils.parseEther("10000");
      await underlyingAsset.mint(user1.address, mintAmount);
      await underlyingAsset.connect(user1).approve(vault.address, mintAmount);

      await vault.connect(user1)["mint(uint256,address)"](depositAmount, user1.address);
      await vault.connect(user1)["mint(uint256,address)"](depositAmount, user1.address);

      await expect(
        vault.connect(user1)["mint(uint256,address)"](depositAmount, user1.address),
      ).to.be.revertedWithCustomError(vault, "BaseERC4626__MintMoreThanMax");
    });
  });

  describe("redeem", function () {
    it("Should redeem shares for underlying asset", async function () {
      const { vault, underlyingAsset } = await loadFixture(mintVaultSharesFixture);
      const [user1] = await ethers.getSigners();

      const user1Balance = await vault.balanceOf(user1.address);
      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(redeemTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, vault.address],
        [user1Balance, user1Balance.mul(-1)],
      );
      await expect(redeemTx).to.changeTokenBalance(vault, user1.address, user1Balance.mul(-1));
    });

    it("Should redeem shares accounting for asset invested", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [user1, , , admin] = await ethers.getSigners();

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      const user1Balance = await vault.balanceOf(user1.address);
      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(redeemTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, underlyingVault.address, vault.address],
        [totalAssets, totalAssets.mul(-1), 0],
      );
      await expect(redeemTx).to.changeTokenBalance(vault, user1.address, user1Balance.mul(-1));
    });

    it("Should redeem shares accounting for generated yield", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [user1, , , admin] = await ethers.getSigners();

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      // Generate yield
      const yieldAmount = ethers.utils.parseEther("1");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      const user1Balance = await vault.balanceOf(user1.address);
      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(redeemTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, underlyingVault.address, vault.address],
        [totalAssets.add(yieldAmount), totalAssets.add(yieldAmount).mul(-1), 0],
      );
      await expect(redeemTx).to.changeTokenBalance(vault, user1.address, user1Balance.mul(-1));
    });

    it("Should correctly distribute yield", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      // Generate yield
      const yieldAmount = ethers.utils.parseEther("1");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = ethers.utils.parseEther("1000");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);
      await vault.connect(admin).invest(user2Amount);

      const user1Balance = await vault.balanceOf(user1.address);
      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(redeemTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, underlyingVault.address, vault.address],
        [totalAssets.add(yieldAmount), totalAssets.add(yieldAmount).mul(-1), 0],
      );
      await expect(redeemTx).to.changeTokenBalance(vault, user1.address, user1Balance.mul(-1));
    });

    it("Should take all assets from lobby if available", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      // Generate yield
      const yieldAmount = ethers.utils.parseEther("1");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = ethers.utils.parseEther("1000");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);

      const user1Balance = await vault.balanceOf(user1.address);
      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(redeemTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, underlyingVault.address, vault.address],
        [totalAssets.add(yieldAmount), yieldAmount.mul(-1), totalAssets.mul(-1)],
      );
      await expect(redeemTx).to.changeTokenBalance(vault, user1.address, user1Balance.mul(-1));
    });

    it("Should take partial assets from lobby if available", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      // Generate yield
      const yieldAmount = ethers.utils.parseEther("1");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = ethers.utils.parseEther("500");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);

      const user1Balance = await vault.balanceOf(user1.address);
      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(redeemTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, underlyingVault.address, vault.address],
        [totalAssets.add(yieldAmount), user2Amount.add(yieldAmount).mul(-1), user2Amount.mul(-1)],
      );
      await expect(redeemTx).to.changeTokenBalance(vault, user1.address, user1Balance.mul(-1));
    });
  });

  describe("withdraw", function () {
    it("Should withdraw assets for vault shares", async function () {
      const { vault, underlyingAsset } = await loadFixture(mintVaultSharesFixture);
      const [user1] = await ethers.getSigners();

      const user1Shares = await vault.balanceOf(user1.address);
      const user1Balance = await vault.convertToAssets(user1Shares);
      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(withdrawTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, vault.address],
        [user1Balance, user1Balance.mul(-1)],
      );
      await expect(withdrawTx).to.changeTokenBalance(vault, user1.address, user1Balance.mul(-1));
    });

    it("Should withdraw assets accounting for asset invested", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [user1, , , admin] = await ethers.getSigners();

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      const user1Shares = await vault.balanceOf(user1.address);
      const user1Balance = await vault.convertToAssets(user1Shares);
      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(withdrawTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, underlyingVault.address, vault.address],
        [totalAssets, totalAssets.mul(-1), 0],
      );
      await expect(withdrawTx).to.changeTokenBalance(vault, user1.address, user1Balance.mul(-1));
    });

    it("Should withdraw assets accounting for generated yield", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [user1, , , admin] = await ethers.getSigners();

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      // Generate yield
      const yieldAmount = ethers.utils.parseEther("1");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      const user1Shares = await vault.balanceOf(user1.address);
      const user1Balance = await vault.convertToAssets(user1Shares);
      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(withdrawTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, underlyingVault.address, vault.address],
        [totalAssets.add(yieldAmount), totalAssets.add(yieldAmount).mul(-1), 0],
      );
      await expect(withdrawTx).to.changeTokenBalance(vault, user1.address, user1Shares.mul(-1));
    });

    it("Should correctly distribute yield", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      // Generate yield
      const yieldAmount = ethers.utils.parseEther("1");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = ethers.utils.parseEther("1000");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);
      await vault.connect(admin).invest(user2Amount);

      const user1Shares = await vault.balanceOf(user1.address);
      const user1Balance = await vault.convertToAssets(user1Shares);
      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(withdrawTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, underlyingVault.address, vault.address],
        [totalAssets.add(yieldAmount), totalAssets.add(yieldAmount).mul(-1), 0],
      );
      await expect(withdrawTx).to.changeTokenBalance(vault, user1.address, user1Shares.mul(-1));
    });

    it("Should take all assets from lobby if available", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      // Generate yield
      const yieldAmount = ethers.utils.parseEther("1");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = ethers.utils.parseEther("1000");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);

      const user1Shares = await vault.balanceOf(user1.address);
      const user1Balance = await vault.convertToAssets(user1Shares);
      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(withdrawTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, underlyingVault.address, vault.address],
        [totalAssets.add(yieldAmount), yieldAmount.mul(-1), totalAssets.mul(-1)],
      );
      await expect(withdrawTx).to.changeTokenBalance(vault, user1.address, user1Shares.mul(-1));
    });

    it("Should take partial assets from lobby if available", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      // Generate yield
      const yieldAmount = ethers.utils.parseEther("1");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = ethers.utils.parseEther("500");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);

      const user1Shares = await vault.balanceOf(user1.address);
      const user1Balance = await vault.convertToAssets(user1Shares);
      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      await expect(withdrawTx).to.changeTokenBalances(
        underlyingAsset,
        [user1.address, underlyingVault.address, vault.address],
        [totalAssets.add(yieldAmount), user2Amount.add(yieldAmount).mul(-1), user2Amount.mul(-1)],
      );
      await expect(withdrawTx).to.changeTokenBalance(vault, user1.address, user1Shares.mul(-1));
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
});