import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { increase } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { deployVaultFixture, mintVaultSharesFixture } from "./utils/fixtures";
import { getPermitSignature } from "./utils/getPermitSignature";

const { parseEther } = ethers.utils;

describe("CoveredVault", function () {
  describe("totalAssets", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      expect(await vault.totalAssets()).to.equal(0);

      // Mint assets to user
      const userAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.connect(user1).approve(vault.address, userAmount);

      // First deposit assets into vault
      const depositAmount = parseEther("1000");
      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);
      expect(await vault.totalAssets()).to.equal(depositAmount);

      // Invests assets into underlying vault
      const investAmount = depositAmount.div(2);
      await vault.connect(admin).invest(investAmount);

      expect(await vault.totalAssets()).to.equal(depositAmount);

      // Second deposit to the vault
      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);
      expect(await vault.totalAssets()).to.equal(depositAmount.mul(2));

      // Mint to the underlying vault. This should increase the value of the underlying shares
      const underlyingVaultYield = parseEther("2000");
      await underlyingAsset.mint(underlyingVault.address, underlyingVaultYield);
      expect(await vault.totalAssets()).to.equal(depositAmount.mul(2).add(underlyingVaultYield));
    });
  });

  describe("convertToShares", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      // Mint assets to user and deposit
      const userAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.connect(user1).approve(vault.address, userAmount);

      const assets = parseEther("1000");
      await vault.connect(user1)["deposit(uint256,address)"](assets, user1.address);

      const shares = assets;

      // 1:1 rate
      expect(await vault.convertToShares(assets)).to.equal(shares);

      // Invest
      const newInvest = assets;
      await vault.connect(admin).invest(newInvest);

      // Increase assets in underlying vault
      const increasedValue = assets;
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:2 rate
      expect(await vault.convertToShares(assets)).to.equal(shares.div(2));

      // Increase assets in underlying vault
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:3 rate
      expect(await vault.convertToShares(assets)).to.equal(shares.div(3));

      // Increase assets to underlying vault
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:4 rate
      expect(await vault.convertToShares(assets)).to.equal(shares.div(4));

      // uninvest
      const uvShares = await underlyingVault.balanceOf(vault.address);
      await vault.connect(admin).uninvest(uvShares);

      // 1:4 rate
      expect(await vault.convertToShares(assets)).to.equal(shares.div(4));
    });
  });

  describe("convertToAssets", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      // Mint assets to user and deposit
      const userAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.connect(user1).approve(vault.address, userAmount);

      const assets = parseEther("1000");
      await vault.connect(user1)["deposit(uint256,address)"](assets, user1.address);

      const shares = assets;

      // 1:1 rate
      expect(await vault.convertToAssets(shares)).to.equal(shares);

      // Invest
      const newInvest = assets;
      await vault.connect(admin).invest(newInvest);

      // Increase assets in underlying vault
      const increasedValue = assets;
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:2 rate
      expect(await vault.convertToAssets(shares)).to.equal(assets.mul(2));

      // Increase assets in underlying vault
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:3 rate
      expect(await vault.convertToAssets(shares)).to.equal(assets.mul(3));

      // Increase assets to underlying vault
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:4 rate
      expect(await vault.convertToAssets(shares)).to.equal(assets.mul(4));

      // uninvest
      const uvShares = await underlyingVault.balanceOf(vault.address);
      await vault.connect(admin).uninvest(uvShares);

      // 1:4 rate
      expect(await vault.convertToAssets(shares)).to.equal(assets.mul(4));
    });
  });

  describe("previewDeposit", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      // Mint assets to user and deposit
      const userAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.connect(user1).approve(vault.address, userAmount);

      const depositAssets = parseEther("1000");
      await vault.connect(user1)["deposit(uint256,address)"](depositAssets, user1.address);

      const shares = depositAssets;

      // 1:1 rate
      expect(await vault.previewDeposit(depositAssets)).to.equal(shares);

      // Invest
      await vault.connect(admin).invest(depositAssets);

      // Increase assets in underlying vault
      const increasedValue = depositAssets;
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:2 rate
      expect(await vault.previewDeposit(depositAssets)).to.equal(shares.div(2));

      // Increase assets in underlying vault
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:3 rate
      expect(await vault.previewDeposit(depositAssets)).to.equal(shares.div(3));

      // Increase assets in underlying vault
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:4 rate
      expect(await vault.previewDeposit(depositAssets)).to.equal(shares.div(4));

      // uninvest
      const uvShares = await underlyingVault.balanceOf(vault.address);
      await vault.connect(admin).uninvest(uvShares);

      // 1:4 rate
      expect(await vault.previewDeposit(depositAssets)).to.equal(shares.div(4));
    });
  });

  describe("previewDeposit with fee", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      await vault.connect(admin).setDepositFee(0.05 * 1e4);
      await increase(2 * 7 * 24 * 60 * 60); // 2 weeks
      await vault.connect(admin).applyDepositFee();

      const depositFee = await vault.depositFee();
      const FEE_DENOMINATOR = await vault.FEE_DENOMINATOR();

      // Mint assets to user and deposit
      const userAmount = parseEther("1000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.connect(user1).approve(vault.address, userAmount);

      const depositAmount = parseEther("100");
      const fee = depositAmount.mul(depositFee).div(FEE_DENOMINATOR);
      const shares = depositAmount.sub(fee);

      // 1:1 rate
      expect(await vault.previewDeposit(depositAmount)).to.equal(shares);

      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

      // 1:1 rate
      expect(await vault.previewDeposit(depositAmount)).to.equal(shares);

      const investAmount = depositAmount.sub(fee);
      await vault.connect(admin).invest(investAmount);

      // 1:2 rate
      await underlyingAsset.mint(underlyingVault.address, investAmount);
      expect(await vault.previewDeposit(depositAmount)).to.equal(shares.div(2));

      // 1:3 rate
      await underlyingAsset.mint(underlyingVault.address, investAmount);
      expect(await vault.previewDeposit(depositAmount)).to.equal(shares.div(3));

      // 1:4 rate
      await underlyingAsset.mint(underlyingVault.address, investAmount);
      expect(await vault.previewDeposit(depositAmount)).to.equal(shares.div(4));
    });
  });

  describe("maxDeposit", function () {
    it("Should account for max asset limit and total assets", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      expect(await vault.maxDeposit(user1.address)).to.equal(constants.MaxUint256);

      // Mint assets to user and deposit
      const mintAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, mintAmount);
      await underlyingAsset.connect(user1).approve(vault.address, mintAmount);

      const depositAmount = parseEther("1000");
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
      const [user1, , , admin] = await ethers.getSigners();

      // Mint assets to user and deposit
      const userAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.connect(user1).approve(vault.address, userAmount);

      const depositAssets = parseEther("1000");
      await vault.connect(user1)["deposit(uint256,address)"](depositAssets, user1.address);

      const mintShares = depositAssets;
      const assets = mintShares;

      // 1:1 rate
      expect(await vault.previewMint(mintShares)).to.equal(assets);

      // Invest
      await vault.connect(admin).invest(depositAssets);

      // Increase assets in underlying vault
      const increasedValue = depositAssets;
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:2 rate
      expect(await vault.previewMint(mintShares)).to.equal(assets.mul(2));

      // Increase assets in underlying vault
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:3 rate
      expect(await vault.previewMint(mintShares)).to.equal(assets.mul(3));

      // Increase assets in underlying vault
      await underlyingAsset.mint(underlyingVault.address, increasedValue);

      // 1:4 rate
      expect(await vault.previewMint(mintShares)).to.equal(assets.mul(4));

      // uninvest
      const uvShares = await underlyingVault.balanceOf(vault.address);
      await vault.connect(admin).uninvest(uvShares);

      // 1:4 rate
      expect(await vault.previewMint(mintShares)).to.equal(assets.mul(4));
    });
  });

  describe("previewMint with fee", function () {
    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      await vault.connect(admin).setDepositFee(0.05 * 1e4);
      await increase(2 * 7 * 24 * 60 * 60); // 2 weeks
      await vault.connect(admin).applyDepositFee();

      const depositFee = await vault.depositFee();
      const FEE_DENOMINATOR = await vault.FEE_DENOMINATOR();

      // Mint assets to user and deposit
      const userAmount = parseEther("1000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.connect(user1).approve(vault.address, userAmount);

      const depositAmount = parseEther("100");
      const fee = depositAmount.mul(depositFee).div(FEE_DENOMINATOR);
      const shares = depositAmount.sub(fee);

      // 1:1 rate
      expect(await vault.previewMint(shares)).to.equal(depositAmount);

      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

      // 1:1 rate
      expect(await vault.previewMint(shares)).to.equal(depositAmount);

      const investAmount = depositAmount.sub(fee);
      await vault.connect(admin).invest(investAmount);

      // 1:2 rate
      await underlyingAsset.mint(underlyingVault.address, investAmount);
      expect(await vault.previewMint(shares)).to.equal(depositAmount.mul(2));

      // 1:3 rate
      await underlyingAsset.mint(underlyingVault.address, investAmount);
      expect(await vault.previewMint(shares)).to.equal(depositAmount.mul(3));

      // 1:4 rate
      await underlyingAsset.mint(underlyingVault.address, investAmount);
      expect(await vault.previewMint(shares)).to.equal(depositAmount.mul(4));
    });
  });

  describe("maxMint", function () {
    it("Should account for max asset limit and total assets", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      expect(await vault.maxDeposit(user1.address)).to.equal(constants.MaxUint256);

      // Mint assets to user and deposit
      const mintAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, mintAmount);
      await underlyingAsset.connect(user1).approve(vault.address, mintAmount);

      const depositAmount = parseEther("1000");
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
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      // Mint assets to user and deposit
      const userAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.mint(user2.address, userAmount);

      await underlyingAsset.connect(user1).approve(vault.address, userAmount);
      await underlyingAsset.connect(user2).approve(vault.address, userAmount);

      expect(await vault.idleAssets()).to.equal(0);

      const depositAssets = parseEther("1000");
      await vault.connect(user1)["deposit(uint256,address)"](depositAssets, user1.address);

      expect(await vault.idleAssets()).to.equal(depositAssets);

      const initialShares = await vault.balanceOf(user2.address);
      await vault.connect(user2)["deposit(uint256,address)"](depositAssets, user2.address);

      expect(await vault.idleAssets()).to.equal(depositAssets.mul(2));

      const firstDepositShares = await vault.balanceOf(user2.address);

      // 1:1 rate
      expect(firstDepositShares).to.equal(initialShares.add(depositAssets));

      // Increase vault assets
      await vault.connect(admin).invest(depositAssets.mul(2));
      expect(await vault.idleAssets()).to.equal(0);

      await underlyingAsset.mint(underlyingVault.address, depositAssets);
      const uvShares = await underlyingVault.balanceOf(vault.address);
      await vault.connect(admin).uninvest(uvShares);
      expect(await vault.idleAssets()).to.equal(depositAssets.mul(3));

      await vault.connect(user2)["deposit(uint256,address)"](depositAssets, user2.address);
      const secondDepositShares = await vault.balanceOf(user2.address);

      expect(await vault.idleAssets()).to.equal(depositAssets.mul(4));

      // 1:2/3 rate
      expect(secondDepositShares).to.equal(firstDepositShares.add(depositAssets.mul(2).div(3)));
    });

    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      // Mint assets to user and deposit
      const userAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.mint(user2.address, userAmount);

      await underlyingAsset.connect(user1).approve(vault.address, userAmount);
      await underlyingAsset.connect(user2).approve(vault.address, userAmount);

      expect(await vault.idleAssets()).to.equal(0);

      const depositAssets = parseEther("1000");
      await vault.connect(user1)["deposit(uint256,address)"](depositAssets, user1.address);

      expect(await vault.idleAssets()).to.equal(depositAssets);

      // Deposit assets into underlying vault to the vault account
      await vault.connect(admin).invest(depositAssets);
      await underlyingAsset.mint(underlyingVault.address, depositAssets);

      expect(await vault.idleAssets()).to.equal(0);

      const initialShares = await vault.balanceOf(user2.address);

      await vault.connect(user2)["deposit(uint256,address)"](depositAssets, user2.address);

      expect(await vault.idleAssets()).to.equal(depositAssets);

      const firstDepositShares = await vault.balanceOf(user2.address);

      // 1:1/2 rate
      expect(firstDepositShares).to.equal(initialShares.add(depositAssets.div(2)));
    });

    it("Should account for max deposit", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const depositAmount = parseEther("1000");

      // Set max assets limit
      await vault.connect(admin).setMaxAssetsLimit(depositAmount.mul(2));

      // Mint assets to user and deposit
      const mintAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, mintAmount);
      await underlyingAsset.connect(user1).approve(vault.address, mintAmount);

      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);
      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

      await expect(
        vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address),
      ).to.be.revertedWithCustomError(vault, "BaseERC4626__DepositMoreThanMax");
    });
  });

  describe("deposit with fee", function () {
    it("Should discount fee and accumulate it for operator", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [user1, user2, user3, admin] = await ethers.getSigners();

      await vault.connect(admin).setDepositFee(0.05 * 1e4);
      await increase(2 * 7 * 24 * 60 * 60); // 2 weeks
      await vault.connect(admin).applyDepositFee();

      const depositFee = await vault.depositFee();
      const FEE_DENOMINATOR = await vault.FEE_DENOMINATOR();

      // Mint assets to user and deposit
      const depositAmount = ethers.utils.parseEther("100");
      const user3DepositAmount = depositAmount.mul(2);
      await underlyingAsset.mint(user1.address, depositAmount);
      await underlyingAsset.mint(user2.address, depositAmount);
      await underlyingAsset.mint(user3.address, user3DepositAmount);
      await underlyingAsset.connect(user1).approve(vault.address, depositAmount);
      await underlyingAsset.connect(user2).approve(vault.address, depositAmount);
      await underlyingAsset.connect(user3).approve(vault.address, user3DepositAmount);

      const initialSharesUser1 = await vault.balanceOf(user1.address);
      const initialSharesUser2 = await vault.balanceOf(user2.address);

      const initialAssetsUser1 = await underlyingAsset.balanceOf(user1.address);
      const initialAssetsUser2 = await underlyingAsset.balanceOf(user2.address);
      const vaultInitialBalance = await underlyingAsset.balanceOf(vault.address);

      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);
      await vault.connect(user2)["deposit(uint256,address)"](depositAmount, user2.address);

      const firstDepositSharesUser1 = await vault.balanceOf(user1.address);
      const firstDepositSharesUser2 = await vault.balanceOf(user2.address);

      const afterDepositAssetsUser1 = await underlyingAsset.balanceOf(user1.address);
      const afterDepositAssetsUser2 = await underlyingAsset.balanceOf(user2.address);

      const fee = depositAmount.mul(depositFee).div(FEE_DENOMINATOR); // 5% of depositAmount

      // 1:1 rate
      expect(firstDepositSharesUser1).to.equal(initialSharesUser1.add(depositAmount.sub(fee)));
      expect(firstDepositSharesUser2).to.equal(initialSharesUser2.add(depositAmount.sub(fee)));

      expect(afterDepositAssetsUser1).to.equal(initialAssetsUser1.sub(depositAmount));
      expect(afterDepositAssetsUser2).to.equal(initialAssetsUser2.sub(depositAmount));

      const vaultAfterDepositBalance = await underlyingAsset.balanceOf(vault.address);
      expect(vaultAfterDepositBalance).to.equal(vaultInitialBalance.add(depositAmount.mul(2)));

      expect(await vault.idleAssets()).to.equal(depositAmount.sub(fee).mul(2));
      expect(await vault.accumulatedAssetFees()).to.equal(fee.mul(2));

      const investAmount = depositAmount.sub(fee).mul(2);
      await vault.connect(admin).invest(investAmount);
      await underlyingAsset.mint(underlyingVault.address, investAmount);

      const initialSharesUser3 = await vault.balanceOf(user3.address);
      const initialAssetsUser3 = await underlyingAsset.balanceOf(user3.address);

      await vault.connect(user3)["deposit(uint256,address)"](user3DepositAmount, user3.address);

      const sharesUser3 = await vault.balanceOf(user3.address);
      const assetsUser3 = await underlyingAsset.balanceOf(user3.address);
      expect(sharesUser3).to.equal(initialSharesUser3.add(depositAmount.sub(fee)));
      expect(assetsUser3).to.equal(initialAssetsUser3.sub(user3DepositAmount));

      expect(await vault.idleAssets()).to.equal(depositAmount.sub(fee).mul(2));
      expect(await vault.underlyingVaultShares()).to.equal(depositAmount.sub(fee).mul(2));
      expect(await vault.accumulatedAssetFees()).to.equal(fee.mul(4));
    });
  });

  describe("mint", function () {
    it("Should account for assets in the vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      // Mint assets to user and deposit
      const userAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.mint(user2.address, userAmount);

      await underlyingAsset.connect(user1).approve(vault.address, userAmount);
      await underlyingAsset.connect(user2).approve(vault.address, userAmount);

      expect(await vault.idleAssets()).to.equal(0);

      const mintShares = parseEther("1000");
      const depositAssets = mintShares; // 1:1 rate
      await vault.connect(user1)["mint(uint256,address)"](mintShares, user1.address);

      expect(await vault.idleAssets()).to.equal(depositAssets);

      const initialAssets = await underlyingAsset.balanceOf(user2.address);

      await vault.connect(user2)["mint(uint256,address)"](mintShares, user2.address);

      expect(await vault.idleAssets()).to.equal(depositAssets.mul(2));

      const firstDepositAssets = await underlyingAsset.balanceOf(user2.address);

      // 1:1 rate
      expect(firstDepositAssets).to.equal(initialAssets.sub(depositAssets));

      // Increase vault assets
      await vault.connect(admin).invest(depositAssets.mul(2));
      expect(await vault.idleAssets()).to.equal(0);

      await underlyingAsset.mint(underlyingVault.address, depositAssets);
      const uvShares = await underlyingVault.balanceOf(vault.address);
      await vault.connect(admin).uninvest(uvShares);
      expect(await vault.idleAssets()).to.equal(depositAssets.mul(3));

      const previewAssetAmount = await vault.previewMint(mintShares);
      await vault.connect(user2)["mint(uint256,address)"](mintShares, user2.address);
      const secondDepositAssets = await underlyingAsset.balanceOf(user2.address);

      expect(await vault.idleAssets()).to.equal(depositAssets.mul(3).add(previewAssetAmount));

      // 1:3/2 rate
      expect(secondDepositAssets).to.equal(firstDepositAssets.sub(depositAssets.mul(3).div(2)));
    });

    it("Should account for assets in the underlying vault", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, user2, , admin] = await ethers.getSigners();

      // Mint assets to user and deposit
      const userAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, userAmount);
      await underlyingAsset.mint(user2.address, userAmount);

      await underlyingAsset.connect(user1).approve(vault.address, userAmount);
      await underlyingAsset.connect(user2).approve(vault.address, userAmount);

      expect(await vault.idleAssets()).to.equal(0);

      const mintShares = parseEther("1000");
      const depositAssets = mintShares; // 1:1 rate
      await vault.connect(user1)["deposit(uint256,address)"](mintShares, user1.address);

      expect(await vault.idleAssets()).to.equal(depositAssets);

      // Deposit assets into underlying vault to the vault account
      await vault.connect(admin).invest(mintShares);
      expect(await vault.idleAssets()).to.equal(0);

      await underlyingAsset.mint(underlyingVault.address, mintShares);

      const initialAssets = await underlyingAsset.balanceOf(user2.address);

      await vault.connect(user2)["mint(uint256,address)"](mintShares, user2.address);

      // needed twice assets amount to mint the same shares
      expect(await vault.idleAssets()).to.equal(depositAssets.mul(2));

      const firstDepositAssets = await underlyingAsset.balanceOf(user2.address);

      // 1:2 rate
      expect(firstDepositAssets).to.equal(initialAssets.sub(mintShares.mul(2)));
    });

    it("Should account for max mint", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const mintShares = parseEther("1000");
      const assetsAmount = mintShares; // 1:1

      // Set max assets limit
      await vault.connect(admin).setMaxAssetsLimit(assetsAmount.mul(2));

      // Mint assets to user and deposit
      const mintAmount = parseEther("10000");
      await underlyingAsset.mint(user1.address, mintAmount);
      await underlyingAsset.connect(user1).approve(vault.address, mintAmount);

      expect(await vault.idleAssets()).to.equal(0);

      await vault.connect(user1)["mint(uint256,address)"](mintShares, user1.address);

      expect(await vault.idleAssets()).to.equal(assetsAmount);

      await vault.connect(user1)["mint(uint256,address)"](mintShares, user1.address);

      expect(await vault.idleAssets()).to.equal(assetsAmount.mul(2));

      await expect(
        vault.connect(user1)["mint(uint256,address)"](mintShares, user1.address),
      ).to.be.revertedWithCustomError(vault, "BaseERC4626__MintMoreThanMax");
    });
  });

  describe("mint with fee", function () {
    it("Should discount fee and accumulate it to operator", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [user1, user2, user3, admin] = await ethers.getSigners();

      await vault.connect(admin).setDepositFee(0.05 * 1e4);
      await increase(2 * 7 * 24 * 60 * 60); // 2 weeks
      await vault.connect(admin).applyDepositFee();

      const depositFee = await vault.depositFee();
      const FEE_DENOMINATOR = await vault.FEE_DENOMINATOR();

      // Mint assets to user and deposit
      const sharesToMint = ethers.utils.parseEther("95"); // As an inverse cases of deposit with fee test
      const depositAmount = sharesToMint.mul(FEE_DENOMINATOR).div(FEE_DENOMINATOR.sub(depositFee)); // Expected to be spent in 1:1 case in exchange for 95 shares
      const user3DepositAmount = depositAmount.mul(2);

      await underlyingAsset.mint(user1.address, depositAmount);
      await underlyingAsset.mint(user2.address, depositAmount);
      await underlyingAsset.mint(user3.address, user3DepositAmount);
      await underlyingAsset.connect(user1).approve(vault.address, depositAmount);
      await underlyingAsset.connect(user2).approve(vault.address, depositAmount);
      await underlyingAsset.connect(user3).approve(vault.address, user3DepositAmount);

      const fee = depositAmount.mul(depositFee).div(FEE_DENOMINATOR); // 5% of depositAmount

      const initialSharesUser1 = await vault.balanceOf(user1.address);
      const initialSharesUser2 = await vault.balanceOf(user2.address);

      const initialAssetsUser1 = await underlyingAsset.balanceOf(user1.address);
      const initialAssetsUser2 = await underlyingAsset.balanceOf(user2.address);
      const vaultInitialBalance = await underlyingAsset.balanceOf(vault.address);

      await vault.connect(user1)["mint(uint256,address)"](sharesToMint, user1.address);
      await vault.connect(user2)["mint(uint256,address)"](sharesToMint, user2.address);

      const afterDepositAssetsUser1 = await underlyingAsset.balanceOf(user1.address);
      const afterDepositAssetsUser2 = await underlyingAsset.balanceOf(user2.address);

      expect(afterDepositAssetsUser1).to.equal(initialAssetsUser1.sub(depositAmount));
      expect(afterDepositAssetsUser2).to.equal(initialAssetsUser2.sub(depositAmount));

      const afterSharesUser1 = await vault.balanceOf(user1.address);
      const afterSharesUser2 = await vault.balanceOf(user2.address);

      // 1:1 rate
      expect(afterSharesUser1).to.equal(initialSharesUser1.add(sharesToMint));
      expect(afterSharesUser2).to.equal(initialSharesUser2.add(sharesToMint));

      const vaultAfterDepositBalance = await underlyingAsset.balanceOf(vault.address);
      expect(vaultAfterDepositBalance).to.equal(vaultInitialBalance.add(depositAmount.mul(2)));

      expect(await vault.idleAssets()).to.equal(depositAmount.sub(fee).mul(2));
      expect(await vault.accumulatedAssetFees()).to.equal(fee.mul(2));

      const investAmount = depositAmount.sub(fee).mul(2);
      await vault.connect(admin).invest(investAmount);
      await underlyingAsset.mint(underlyingVault.address, investAmount);

      const initialSharesUser3 = await vault.balanceOf(user3.address);
      const initialAssetsUser3 = await underlyingAsset.balanceOf(user3.address);

      await vault.connect(user3)["mint(uint256,address)"](sharesToMint, user3.address);

      const sharesUser3 = await vault.balanceOf(user3.address);
      const assetsUser3 = await underlyingAsset.balanceOf(user3.address);
      expect(sharesUser3).to.equal(initialSharesUser3.add(depositAmount.sub(fee)));
      expect(assetsUser3).to.equal(initialAssetsUser3.sub(user3DepositAmount));

      expect(await vault.idleAssets()).to.equal(depositAmount.sub(fee).mul(2));
      expect(await vault.underlyingVaultShares()).to.equal(depositAmount.sub(fee).mul(2));
      expect(await vault.accumulatedAssetFees()).to.equal(fee.mul(4));
    });
  });

  describe("redeem", function () {
    it("Should redeem shares for underlying asset", async function () {
      const { vault, underlyingAsset } = await loadFixture(mintVaultSharesFixture);
      const [user1] = await ethers.getSigners();

      const user1Balance = await vault.balanceOf(user1.address);
      const initialUser1Assets = await vault.convertToAssets(user1Balance);

      expect(await vault.idleAssets()).to.equal(initialUser1Assets);
      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);

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

      const user1Balance = await vault.balanceOf(user1.address);
      const initialUser1Assets = await vault.convertToAssets(user1Balance);

      expect(await vault.idleAssets()).to.equal(initialUser1Assets);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(initialUser1Assets);

      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(0);

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

      const user1Balance = await vault.balanceOf(user1.address);
      const initialUser1Assets = await vault.convertToAssets(user1Balance);

      expect(await vault.idleAssets()).to.equal(initialUser1Assets);

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      expect(await vault.idleAssets()).to.equal(0);

      // Generate yield
      const yieldAmount = parseEther("1");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);

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

      const user1Balance = await vault.balanceOf(user1.address);
      const initialUser1Assets = await vault.convertToAssets(user1Balance);

      expect(await vault.idleAssets()).to.equal(initialUser1Assets);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      // Generate yield
      const yieldAmount = parseEther("1000");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = parseEther("1000");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);

      expect(await vault.idleAssets()).to.equal(user2Amount);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      await vault.connect(admin).invest(user2Amount);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets.add(user2Amount.div(2)));

      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(user2Amount.div(2));

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

      const user1Balance = await vault.balanceOf(user1.address);
      const initialUser1Assets = await vault.convertToAssets(user1Balance);

      expect(await vault.idleAssets()).to.equal(initialUser1Assets);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      // Generate yield
      const yieldAmount = parseEther("1000");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = parseEther("1000");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);

      expect(await vault.idleAssets()).to.equal(user2Amount);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets.div(2));

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

      const user1Balance = await vault.balanceOf(user1.address);
      const initialUser1Assets = await vault.convertToAssets(user1Balance);

      expect(await vault.idleAssets()).to.equal(initialUser1Assets);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      // Generate yield
      const yieldAmount = parseEther("1000");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = parseEther("500");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);

      expect(await vault.idleAssets()).to.equal(user2Amount);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      const redeemTx = await vault["redeem(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets.div(4));

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

      expect(await vault.idleAssets()).to.equal(user1Balance);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(0);

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

      const user1Shares = await vault.balanceOf(user1.address);
      const user1Balance = await vault.convertToAssets(user1Shares);

      expect(await vault.idleAssets()).to.equal(user1Balance);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(0);

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

      const user1Shares = await vault.balanceOf(user1.address);
      const initialUser1Balance = await vault.convertToAssets(user1Shares);

      expect(await vault.idleAssets()).to.equal(initialUser1Balance);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      // Generate yield
      const yieldAmount = parseEther("1000");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      const user1Balance = await vault.convertToAssets(user1Shares);
      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(0);

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

      const user1Shares = await vault.balanceOf(user1.address);
      const initialUser1Balance = await vault.convertToAssets(user1Shares);

      expect(await vault.idleAssets()).to.equal(initialUser1Balance);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      // Generate yield
      const yieldAmount = parseEther("1000");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = parseEther("1000");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);

      expect(await vault.idleAssets()).to.equal(user2Amount);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      await vault.connect(admin).invest(user2Amount);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets.add(user2Amount.div(2)));

      const user1Balance = await vault.convertToAssets(user1Shares);
      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(user2Amount.div(2));

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

      const user1Shares = await vault.balanceOf(user1.address);
      const initialUser1Balance = await vault.convertToAssets(user1Shares);

      expect(await vault.idleAssets()).to.equal(initialUser1Balance);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      // Generate yield
      const yieldAmount = parseEther("1000");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = parseEther("1000");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);

      expect(await vault.idleAssets()).to.equal(user2Amount);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      const user1Balance = await vault.convertToAssets(user1Shares);
      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets.div(2));

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

      const user1Shares = await vault.balanceOf(user1.address);
      const initialUser1Balance = await vault.convertToAssets(user1Shares);

      expect(await vault.idleAssets()).to.equal(initialUser1Balance);
      expect(await vault.underlyingVaultShares()).to.equal(0);

      // Invest all assets into underlying vault
      const totalAssets = await underlyingAsset.balanceOf(vault.address);
      await vault.connect(admin).invest(totalAssets);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      // Generate yield
      const yieldAmount = parseEther("1000");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount);

      // User2 deposit after generated yield
      const user2Amount = parseEther("500");
      await vault.connect(user2)["deposit(uint256,address)"](user2Amount, user2.address);

      expect(await vault.idleAssets()).to.equal(user2Amount);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets);

      const user1Balance = await vault.convertToAssets(user1Shares);
      const withdrawTx = await vault["withdraw(uint256,address,address)"](user1Balance, user1.address, user1.address);

      expect(await vault.idleAssets()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(totalAssets.div(4));

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
