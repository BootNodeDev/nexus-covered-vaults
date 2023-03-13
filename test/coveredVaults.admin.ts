import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { increase } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { deployVaultFixture, mintVaultSharesFixture } from "./utils/fixtures";

const { parseEther } = ethers.utils;

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
      expect(await vault.maxAssetsLimit()).to.equal(ethers.constants.MaxUint256);
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
      const { vault } = await loadFixture(mintVaultSharesFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const botRole = await vault.BOT_ROLE();
      const amount = parseEther("1000");

      await expect(vault.connect(user1).invest(amount.div(2))).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${botRole}`,
      );

      await vault.connect(admin).grantRole(botRole, user1.address);

      await vault.connect(user1).invest(amount.div(2));
      await vault.connect(admin).invest(amount.div(2));
    });

    it("Should revert if paused", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");

      await vault.connect(admin).pause();

      await expect(vault.connect(admin).invest(amount)).to.revertedWith("Pausable: paused");
    });

    it("Should allow to invest all idle assets into the underlying vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");

      const initialIdleAssets = await vault.idleAssets();
      const initialUnderlyingVaultShares = await vault.underlyingVaultShares();

      await expect(vault.connect(admin).invest(amount)).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [amount.mul(-1), amount],
      );

      expect(await vault.idleAssets()).to.equal(initialIdleAssets.sub(amount));
      expect(await vault.underlyingVaultShares()).to.equal(initialUnderlyingVaultShares.add(amount));
    });

    it("Should allow to invest some idle assets into the underlying vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");

      const initialIdleAssets = await vault.idleAssets();
      const initialUnderlyingVaultShares = await vault.underlyingVaultShares();

      const investAmount = amount.div(2);
      await expect(vault.connect(admin).invest(investAmount)).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [amount.div(2).mul(-1), amount.div(2)],
      );

      expect(await vault.idleAssets()).to.equal(initialIdleAssets.sub(investAmount));
      expect(await vault.underlyingVaultShares()).to.equal(initialUnderlyingVaultShares.add(investAmount));
    });

    it("Should revert if trying to invest more assets that the vault has", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");

      await expect(vault.connect(admin).invest(amount.mul(2))).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance",
      );
    });

    it("Should emit an event with amount, shares and caller", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");

      await expect(vault.connect(admin).invest(amount))
        .to.emit(vault, "Invested")
        .withArgs(amount, amount, admin.address);
    });
  });

  describe("uninvest", function () {
    it("Should revert if not admin or bot", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const botRole = await vault.BOT_ROLE();

      const amount = parseEther("1000");

      await expect(vault.connect(user1).uninvest(amount.div(2))).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${botRole}`,
      );

      await vault.connect(admin).grantRole(botRole, user1.address);

      // Invest to be able to uninvest
      await vault.connect(admin).invest(amount);

      await vault.connect(user1).uninvest(amount.div(2));
      await vault.connect(admin).uninvest(amount.div(2));
    });

    it("Should revert if paused", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");

      await vault.connect(admin).pause();

      await expect(vault.connect(admin).uninvest(amount)).to.revertedWith("Pausable: paused");
    });

    it("Should allow to uninvest all active assets out of the underlying vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");
      await vault.connect(admin).invest(amount);

      const initialIdleAssets = await vault.idleAssets();
      const initialUnderlyingVaultShares = await vault.underlyingVaultShares();

      await expect(vault.connect(admin).uninvest(amount)).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [amount, amount.mul(-1)],
      );

      expect(await vault.idleAssets()).to.equal(initialIdleAssets.add(amount));
      expect(await vault.underlyingVaultShares()).to.equal(initialUnderlyingVaultShares.sub(amount));
    });

    it("Should allow to uninvest active assets with returns out of the underlying vault", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");

      await vault.connect(admin).invest(amount);

      const initialIdleAssets = await vault.idleAssets();
      const initialUnderlyingVaultShares = await vault.underlyingVaultShares();

      // 100% yield
      await underlyingAsset.mint(underlyingVault.address, amount);

      await expect(vault.connect(admin).uninvest(amount)).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [amount.mul(2), amount.mul(-2)],
      );

      expect(await vault.idleAssets()).to.equal(initialIdleAssets.add(amount.mul(2)));
      expect(await vault.underlyingVaultShares()).to.equal(initialUnderlyingVaultShares.sub(amount));
    });

    it("Should emit an event with amount, shares and caller", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");

      await vault.connect(admin).invest(amount);

      await expect(vault.connect(admin).uninvest(amount))
        .to.emit(vault, "UnInvested")
        .withArgs(amount, amount, admin.address);
    });
  });

  describe("Pausable", function () {
    it("Should be able to pause only by admin", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);

      const [botUser, anyUser, , admin] = await ethers.getSigners();
      await vault.connect(admin).grantRole(vault.BOT_ROLE(), botUser.address);

      await expect(vault.connect(botUser).pause()).to.be.reverted;
      await expect(vault.connect(anyUser).pause()).to.be.reverted;
      await vault.connect(admin).pause();
      expect(await vault.connect(admin).paused()).to.equal(true);
    });

    it("Should be able to unpause when paused only by admin", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);

      const [botUser, anyUser, , admin] = await ethers.getSigners();
      await vault.connect(admin).grantRole(vault.BOT_ROLE(), botUser.address);
      await vault.connect(admin).pause();

      await expect(vault.connect(botUser).unpause()).to.be.reverted;
      await expect(vault.connect(anyUser).unpause()).to.be.reverted;
      await vault.connect(admin).unpause();
      expect(await vault.connect(admin).paused()).to.equal(false);
    });

    it("Should revert calls to deposit when paused", async function () {
      const pausedError = "Pausable: paused";
      const amount = parseEther("1000");

      const { vault } = await loadFixture(mintVaultSharesFixture);

      const [anyUser, , , admin] = await ethers.getSigners();

      await vault.connect(admin).pause();

      // check vault deposit fails with admin-nonAdmin when paused
      await expect(vault.connect(anyUser)["deposit(uint256,address)"](amount, anyUser.address)).to.be.revertedWith(
        pausedError,
      );
      await expect(vault.connect(admin)["deposit(uint256,address)"](amount, anyUser.address)).to.be.revertedWith(
        pausedError,
      );

      // check vault deposit fails with admin-nonAdmin when paused
      await expect(
        vault.connect(anyUser)["deposit(uint256,address,uint256)"](amount, anyUser.address, amount),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault.connect(admin)["deposit(uint256,address,uint256)"](amount, anyUser.address, amount),
      ).to.be.revertedWith(pausedError);
    });

    it("Should revert calls to mint when paused", async function () {
      const pausedError = "Pausable: paused";
      const amount = parseEther("1000");

      const { vault } = await loadFixture(mintVaultSharesFixture);

      const [anyUser, , , admin] = await ethers.getSigners();

      await vault.connect(admin).pause();

      // check underlying vault mint fails with admin-nonAdmin when paused
      await expect(vault.connect(anyUser)["mint(uint256,address)"](amount, anyUser.address)).to.be.revertedWith(
        pausedError,
      );
      await expect(vault.connect(admin)["mint(uint256,address)"](amount, anyUser.address)).to.be.revertedWith(
        pausedError,
      );

      // check vault mint fails with admin-nonAdmin when paused
      await expect(
        vault.connect(anyUser)["mint(uint256,address,uint256)"](amount, anyUser.address, amount),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault.connect(admin)["mint(uint256,address,uint256)"](amount, anyUser.address, amount),
      ).to.be.revertedWith(pausedError);
    });

    it("Should revert calls to withdraw when paused", async function () {
      const pausedError = "Pausable: paused";
      const amount = parseEther("1000");

      const { vault } = await loadFixture(mintVaultSharesFixture);

      const [anyUser, , , admin] = await ethers.getSigners();

      await vault.connect(admin).pause();

      // check underlying vault withdraw fails with admin-nonAdmin when paused
      await expect(
        vault.connect(anyUser)["withdraw(uint256,address,address)"](amount, anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault.connect(admin)["withdraw(uint256,address,address)"](amount, anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);

      // check vault withdraw fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["withdraw(uint256,address,address,uint256)"](amount, anyUser.address, anyUser.address, amount),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["withdraw(uint256,address,address,uint256)"](amount, anyUser.address, anyUser.address, amount),
      ).to.be.revertedWith(pausedError);
    });

    it("Should revert calls to redeem when paused", async function () {
      const pausedError = "Pausable: paused";
      const amount = parseEther("1000");

      const { vault } = await loadFixture(mintVaultSharesFixture);

      const [anyUser, , , admin] = await ethers.getSigners();

      await vault.connect(admin).pause();

      // check underlying vault redeem fails with admin-nonAdmin when paused
      await expect(
        vault.connect(anyUser)["redeem(uint256,address,address)"](amount, anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault.connect(admin)["redeem(uint256,address,address)"](amount, anyUser.address, anyUser.address),
      ).to.be.revertedWith(pausedError);

      // check vault redeem fails with admin-nonAdmin when paused
      await expect(
        vault
          .connect(anyUser)
          ["redeem(uint256,address,address,uint256)"](amount, anyUser.address, anyUser.address, amount),
      ).to.be.revertedWith(pausedError);
      await expect(
        vault
          .connect(admin)
          ["redeem(uint256,address,address,uint256)"](amount, anyUser.address, anyUser.address, amount),
      ).to.be.revertedWith(pausedError);
    });
  });

  describe("setMaxAssetsLimit", function () {
    it("Should allow only admin to update maxAssetsLimit", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const adminRole = await vault.DEFAULT_ADMIN_ROLE();
      const amount = 100;

      expect(await vault.maxAssetsLimit()).to.not.equal(amount);
      // Try with regular user
      await expect(vault.connect(user1).setMaxAssetsLimit(amount)).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`,
      );

      // Try with bot operator
      await vault.connect(admin).grantRole(await vault.BOT_ROLE(), user1.address);

      await expect(vault.connect(user1).setMaxAssetsLimit(amount)).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`,
      );

      // Try with admin
      await vault.connect(admin).setMaxAssetsLimit(amount);

      expect(await vault.maxAssetsLimit()).to.equal(amount);
    });

    it("Should emit an event", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = 100;

      await expect(vault.connect(admin).setMaxAssetsLimit(amount))
        .to.emit(vault, "MaxAssetsLimitUpdated")
        .withArgs(amount);
    });
  });

  describe("setDepositFee", function () {
    it("Should revert if not admin", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.5 * 1e4);

      await expect(vault.connect(user1).setDepositFee(fee)).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${await vault.DEFAULT_ADMIN_ROLE()}`,
      );

      await vault.connect(admin).setDepositFee(fee);
    });

    it("Should revert if proposed fee is bigger than 100%", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(1.1 * 1e4);

      await expect(vault.connect(admin).setDepositFee(fee)).to.revertedWithCustomError(
        vault,
        "CoveredVault__FeeOutOfBound",
      );
    });
  });

  describe("applyDepositFee", function () {
    it("Should revert if not admin", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.3 * 1e4);
      const timeLock = await vault.FEE_TIME_LOCK();
      const adminRole = await vault.DEFAULT_ADMIN_ROLE();

      await vault.connect(admin).setDepositFee(fee);

      await increase(timeLock);
      await expect(vault.connect(user1).applyDepositFee()).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`,
      );

      await vault.connect(admin).applyDepositFee();
    });

    it("Should revert if no proposed fee is found", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      await expect(vault.connect(admin).applyDepositFee()).to.revertedWithCustomError(
        vault,
        "CoveredVault__FeeProposalNotFound",
      );
    });

    it("Should revert after apply was called once", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.3 * 1e4);
      const timeLock = await vault.FEE_TIME_LOCK();

      await vault.connect(admin).setDepositFee(fee);

      await increase(timeLock);
      await vault.connect(admin).applyDepositFee();
      await expect(vault.connect(admin).applyDepositFee()).to.revertedWithCustomError(
        vault,
        "CoveredVault__FeeProposalNotFound",
      );
    });

    it("Should revert if deadline is not due", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.3 * 1e4);
      const timeLock = await vault.FEE_TIME_LOCK();

      await vault.connect(admin).setDepositFee(fee);

      await increase(timeLock.sub("60"));
      await expect(vault.connect(admin).applyDepositFee()).to.revertedWithCustomError(
        vault,
        "CoveredVault__FeeTimeLockNotDue",
      );

      await increase(BigNumber.from("60"));
      await vault.connect(admin).applyDepositFee();
    });

    it("Should change fee and reset proposed fee", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.3 * 1e4);
      const timeLock = await vault.FEE_TIME_LOCK();

      const depositFeeBeforeSet = await vault.depositFee();
      await vault.connect(admin).setDepositFee(fee);

      expect(depositFeeBeforeSet).to.be.equal("0");

      const [_proposedDeadline, proposedFee] = await vault.proposedDepositFee();
      // TODO expect(proposedDeadline).to.be.eq(BigNumber.from(now));
      expect(proposedFee).to.be.eq(fee);

      const depositFeeAfterSet = await vault.depositFee();
      expect(depositFeeAfterSet).to.be.equal("0");

      await increase(timeLock);
      await vault.connect(admin).applyDepositFee();

      const depositFeeAfterApply = await vault.depositFee();
      expect(depositFeeAfterApply).to.be.equal(fee);

      const [resetDeadline, resetFee] = await vault.proposedDepositFee();
      expect(resetFee).to.be.eq("0");
      expect(resetDeadline).to.be.eq("0");
    });
  });

  describe("claimFees", function () {
    it("Should revert if not admin", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      // Mint assets to user and deposit
      const depositAmount = parseEther("1000");
      await underlyingAsset.mint(user1.address, depositAmount);

      const fee = BigNumber.from(0.05 * 1e4);
      const timeLock = await vault.FEE_TIME_LOCK();
      const adminRole = await vault.DEFAULT_ADMIN_ROLE();

      await vault.connect(admin).setDepositFee(fee);
      await increase(timeLock);
      await vault.connect(admin).applyDepositFee();

      await underlyingAsset.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

      await expect(vault.connect(user1).claimFees(admin.address)).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`,
      );

      await vault.connect(admin).claimFees(admin.address);
    });

    it("Should revert if no available fees to claim", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      await expect(vault.connect(admin).claimFees(admin.address)).to.revertedWithCustomError(
        vault,
        "CoveredVault__NoFeesToClaim",
      );
    });

    it("Should transfer fees to destination", async function () {
      const { vault, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, destination, , admin] = await ethers.getSigners();

      // Mint assets to user and deposit
      const depositAmount = parseEther("1000");
      await underlyingAsset.mint(user1.address, depositAmount.mul(2));

      await vault.connect(admin).setDepositFee(BigNumber.from(0.05 * 1e4));
      const timeLock = await vault.FEE_TIME_LOCK();
      await increase(timeLock);
      await vault.connect(admin).applyDepositFee();

      const depositFee = await vault.depositFee();
      const FEE_DENOMINATOR = await vault.FEE_DENOMINATOR();
      const fee = depositAmount.mul(depositFee).div(FEE_DENOMINATOR);

      await underlyingAsset.connect(user1).approve(vault.address, depositAmount.mul(2));
      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

      {
        const accumulatedAssetFees = await vault.accumulatedAssetFees();
        expect(accumulatedAssetFees).to.equal(fee);
      }

      await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

      {
        const accumulatedAssetFees = await vault.accumulatedAssetFees();
        expect(accumulatedAssetFees).to.equal(fee.mul(2));
      }

      const initialBalance = await underlyingAsset.balanceOf(destination.address);
      const accumulatedAssetFeesBefore = await vault.accumulatedAssetFees();

      await vault.connect(admin).claimFees(destination.address);

      const balanceAfter = await underlyingAsset.balanceOf(destination.address);
      const accumulatedAssetFeesAfter = await vault.accumulatedAssetFees();

      expect(balanceAfter).to.equal(initialBalance.add(accumulatedAssetFeesBefore));
      expect(accumulatedAssetFeesAfter).to.equal(0);
    });
  });
});
