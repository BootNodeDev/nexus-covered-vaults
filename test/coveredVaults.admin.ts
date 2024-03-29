import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { increase } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { deployVaultFixture, mintVaultSharesFixture } from "./utils/fixtures";
import { daysToSeconds } from "./utils/utils";

const { parseEther } = ethers.utils;

const vaultName = "USDC Covered Vault";
const vaultSymbol = "cvUSDC";

const poolAlloc = {
  poolId: 0,
  skip: false,
  coverAmountInAsset: ethers.utils.parseEther("10"),
};

const buyCoverParams = {
  coverId: 0,
  owner: ethers.constants.AddressZero, // replace
  productId: 1,
  coverAsset: 0,
  amount: ethers.utils.parseEther("10"),
  period: 0,
  maxPremiumInAsset: ethers.utils.parseEther("1"),
  paymentAsset: ethers.constants.AddressZero, // replace
  commissionRatio: 0,
  commissionDestination: ethers.constants.AddressZero,
  ipfsData: "",
};

const product = {
  productType: 1,
  yieldTokenAddress: ethers.constants.AddressZero,
  coverAssets: 0,
  initialPriceRatio: 4,
  capacityReductionRatio: 1,
  isDeprecated: false,
  useFixedPrice: true,
};

const productParam = {
  productName: "test",
  productId: buyCoverParams.productId,
  ipfsMetadata: buyCoverParams.ipfsData,
  product,
  allowedPools: [],
};

describe("CoveredVault", function () {
  describe("Deployment", function () {
    it("Should correctly set params", async function () {
      const { vault, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);

      const maxAssetsLimit = parseEther("1000000000");

      // covered vault properties
      expect(await vault.underlyingVault()).to.equal(underlyingVault.address);
      // erc4626 properties
      expect(await vault.asset()).to.equal(underlyingAsset.address);
      // erc20 properties
      expect(await vault.name()).to.equal(vaultName);
      expect(await vault.symbol()).to.equal(vaultSymbol);
      expect(await vault.decimals()).to.equal(await underlyingAsset.decimals());
      expect(await vault.maxAssetsLimit()).to.equal(maxAssetsLimit);
    });
  });

  describe("Access Control", function () {
    it("Should give admin rights to admin passed at construction time", async function () {
      const { vault } = await loadFixture(deployVaultFixture);

      const [user1, , , admin] = await ethers.getSigners();

      expect(await vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin.address)).to.equals(true);
      expect(await vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), user1.address)).to.equals(false);

      await vault.connect(admin).grantRole(vault.OPERATOR_ROLE(), user1.address);

      expect(await vault.hasRole(vault.OPERATOR_ROLE(), user1.address)).to.equals(true);
      expect(await vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), user1.address)).to.equals(false);
    });
  });

  describe("invest", function () {
    it("Should revert if not admin or operator", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const operatorRole = await vault.OPERATOR_ROLE();
      const amount = parseEther("1000");

      await expect(vault.connect(user1).invest(amount.div(2))).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${operatorRole}`,
      );

      await vault.connect(admin).grantRole(operatorRole, user1.address);

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

    it("reverts if invalid underlying vault rate", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");

      const investAmount = amount.div(2);

      await vault.connect(admin).invest(investAmount);

      expect(await vault.latestUvRate()).to.equal(parseEther("1"));

      // burn 50% of assets in underlying vault
      await underlyingAsset.burn(underlyingVault.address, investAmount.div(2));

      // set exchange rate threshold to 49%
      await vault.connect(admin).setUnderlyingVaultRateThreshold(4900);

      await expect(vault.connect(admin).invest(investAmount)).to.be.revertedWithCustomError(
        vault,
        "CoveredVault_UnderlyingVaultBadRate",
      );

      // set exchange rate threshold to 50%
      await vault.connect(admin).setUnderlyingVaultRateThreshold(5000);

      await vault.connect(admin).invest(investAmount);

      expect(await vault.latestUvRate()).to.equal(parseEther("0.5"));
    });

    it("reverts if not enough cover for the amount", async function () {
      const { vault, cover } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const investAmount = parseEther("1000");

      const latestBlock = await ethers.provider.getBlock("latest");

      await cover.setMockSegments(false);
      await cover.setSegments(0, [
        {
          amount: investAmount.div(2),
          start: latestBlock.timestamp,
          period: daysToSeconds(30),
          gracePeriod: 0,
          globalRewardsRatio: 0,
          globalCapacityRatio: 0,
        },
      ]);

      await expect(vault.connect(admin).invest(investAmount)).to.be.revertedWithCustomError(
        vault,
        "CoveredVault_InvestExceedsCoverAmount",
      );
    });

    it("reverts if cover expired", async function () {
      const { vault, cover } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const investAmount = parseEther("1000");

      const latestBlock = await ethers.provider.getBlock("latest");

      await cover.setMockSegments(false);
      await cover.setSegments(0, [
        {
          amount: investAmount,
          start: latestBlock.timestamp,
          period: 0, // next block will be expired
          gracePeriod: 0,
          globalRewardsRatio: 0,
          globalCapacityRatio: 0,
        },
      ]);

      await expect(vault.connect(admin).invest(investAmount)).to.be.revertedWithCustomError(
        vault,
        "CoveredVault_InvestExceedsCoverAmount",
      );
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

    it("Should account for management fee", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [, user2, , admin] = await ethers.getSigners();

      const investAmount = parseEther("1000");

      const secondDepositAmount = investAmount;
      await vault.connect(user2)["deposit(uint256,address)"](secondDepositAmount, user2.address);

      // 50%
      await vault.connect(admin).setManagementFee(0.5 * 1e4);
      await increase(2 * 7 * 24 * 60 * 60); // 2 weeks
      await vault.connect(admin).applyManagementFee();

      const managementFee = await vault.managementFee();
      const FEE_DENOMINATOR = await vault.FEE_DENOMINATOR();
      const FEE_MANAGER_PERIOD = await vault.FEE_MANAGER_PERIOD();

      const initialIdleAssets = await vault.idleAssets();
      const initialUnderlyingVaultShares = await vault.underlyingVaultShares();

      expect(await vault.underlyingVaultShares()).to.equal(0);

      await expect(vault.connect(admin).invest(investAmount)).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [investAmount.mul(-1), investAmount],
      );

      expect(await vault.idleAssets()).to.equal(initialIdleAssets.sub(investAmount));
      expect(await vault.underlyingVaultShares()).to.equal(initialUnderlyingVaultShares.add(investAmount));
      expect(await vault.accumulatedUVSharesFees()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(investAmount);

      await increase(FEE_MANAGER_PERIOD.sub(1));
      const feeAmount = investAmount
        .mul(FEE_MANAGER_PERIOD)
        .mul(managementFee)
        .div(FEE_DENOMINATOR)
        .div(FEE_MANAGER_PERIOD);

      const investTx = await vault.connect(admin).invest(investAmount);

      expect(await vault.accumulatedUVSharesFees()).to.equal(feeAmount);
      expect(await vault.underlyingVaultShares()).to.equal(investAmount.sub(feeAmount).add(investAmount));

      await expect(investTx).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [investAmount.mul(-1), investAmount],
      );
      await expect(investTx).to.changeTokenBalance(underlyingVault, vault.address, investAmount);
    });
  });

  describe("uninvest", function () {
    it("Should revert if not admin or operator", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const operatorRole = await vault.OPERATOR_ROLE();

      const amount = parseEther("1000");

      await expect(vault.connect(user1).uninvest(amount.div(2))).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${operatorRole}`,
      );

      await vault.connect(admin).grantRole(operatorRole, user1.address);

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

    it("reverts if invalid underlying vault rate", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");
      const uninvestAmount = amount.div(2);

      await vault.connect(admin).invest(amount);

      expect(await vault.latestUvRate()).to.equal(parseEther("1"));

      // burn 50% of assets in underlying vault
      await underlyingAsset.burn(underlyingVault.address, amount.div(2));

      // set exchange rate threshold to 49%
      await vault.connect(admin).setUnderlyingVaultRateThreshold(4900);

      await expect(vault.connect(admin).uninvest(uninvestAmount)).to.be.revertedWithCustomError(
        vault,
        "CoveredVault_UnderlyingVaultBadRate",
      );

      // set exchange rate threshold to 50%
      await vault.connect(admin).setUnderlyingVaultRateThreshold(5000);

      await vault.connect(admin).uninvest(uninvestAmount);

      expect(await vault.latestUvRate()).to.equal(parseEther("0.5"));
    });

    it("Should account for management fee", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(mintVaultSharesFixture);
      const [, , , admin] = await ethers.getSigners();

      const investAmount = parseEther("1000");

      // 50%
      await vault.connect(admin).setManagementFee(0.5 * 1e4);
      await increase(2 * 7 * 24 * 60 * 60); // 2 weeks
      await vault.connect(admin).applyManagementFee();

      const managementFee = await vault.managementFee();
      const FEE_DENOMINATOR = await vault.FEE_DENOMINATOR();
      const FEE_MANAGER_PERIOD = await vault.FEE_MANAGER_PERIOD();

      const initialIdleAssets = await vault.idleAssets();
      const initialUnderlyingVaultShares = await vault.underlyingVaultShares();

      expect(await vault.underlyingVaultShares()).to.equal(0);

      await vault.connect(admin).invest(investAmount);

      expect(await vault.idleAssets()).to.equal(initialIdleAssets.sub(investAmount));
      expect(await vault.underlyingVaultShares()).to.equal(initialUnderlyingVaultShares.add(investAmount));
      expect(await vault.accumulatedUVSharesFees()).to.equal(0);
      expect(await vault.underlyingVaultShares()).to.equal(investAmount);

      await increase(FEE_MANAGER_PERIOD.sub(1));
      const feeAmount = investAmount
        .mul(FEE_MANAGER_PERIOD)
        .mul(managementFee)
        .div(FEE_DENOMINATOR)
        .div(FEE_MANAGER_PERIOD);

      const uninvestShares = investAmount;

      const uninvestTx = await vault.connect(admin).uninvest(uninvestShares);

      expect(await vault.accumulatedUVSharesFees()).to.equal(feeAmount);
      expect(await vault.underlyingVaultShares()).to.equal(0);
      expect(await vault.idleAssets()).to.equal(investAmount.sub(feeAmount));

      await expect(uninvestTx).to.changeTokenBalances(
        underlyingAsset,
        [vault.address, underlyingVault.address],
        [investAmount.sub(feeAmount), investAmount.sub(feeAmount).mul(-1)],
      );
      await expect(uninvestTx).to.changeTokenBalance(
        underlyingVault,
        vault.address,
        investAmount.sub(feeAmount).mul(-1),
      );
    });
  });

  describe("Pausable", function () {
    it("Should be able to pause only by admin", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);

      const [operatorUser, anyUser, , admin] = await ethers.getSigners();
      await vault.connect(admin).grantRole(vault.OPERATOR_ROLE(), operatorUser.address);

      await expect(vault.connect(operatorUser).pause()).to.be.reverted;
      await expect(vault.connect(anyUser).pause()).to.be.reverted;
      await vault.connect(admin).pause();
      expect(await vault.connect(admin).paused()).to.equal(true);
    });

    it("Should be able to unpause when paused only by admin", async function () {
      const { vault } = await loadFixture(mintVaultSharesFixture);

      const [operatorUser, anyUser, , admin] = await ethers.getSigners();
      await vault.connect(admin).grantRole(vault.OPERATOR_ROLE(), operatorUser.address);
      await vault.connect(admin).pause();

      await expect(vault.connect(operatorUser).unpause()).to.be.reverted;
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

      // Try with operator
      await vault.connect(admin).grantRole(await vault.OPERATOR_ROLE(), user1.address);

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

  describe("setUnderlyingVaultRateThreshold", function () {
    it("Should allow only admin to update underlyingVaultRateThreshold", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const adminRole = await vault.DEFAULT_ADMIN_ROLE();
      const newValue = 2000;

      expect(await vault.uvRateThreshold()).to.not.equal(newValue);

      // Try with regular user
      await expect(vault.connect(user1).setUnderlyingVaultRateThreshold(newValue)).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`,
      );

      // Try with operator role
      await vault.connect(admin).grantRole(await vault.OPERATOR_ROLE(), user1.address);

      await expect(vault.connect(user1).setUnderlyingVaultRateThreshold(newValue)).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`,
      );

      // Try with admin
      await vault.connect(admin).setUnderlyingVaultRateThreshold(newValue);

      expect(await vault.uvRateThreshold()).to.equal(newValue);
    });

    it("reverts if invalid value", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const maxValue = await vault.RATE_THRESHOLD_DENOMINATOR();
      const newValue = maxValue.add(1);

      await expect(vault.connect(admin).setUnderlyingVaultRateThreshold(newValue)).to.be.revertedWithCustomError(
        vault,
        "CoveredVault_RateThresholdOutOfBound",
      );
    });

    it("Should emit an event", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const newValue = 100;

      await expect(vault.connect(admin).setUnderlyingVaultRateThreshold(newValue))
        .to.emit(vault, "RateThresholdUpdated")
        .withArgs(newValue);
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
        "CoveredVault_FeeOutOfBound",
      );
    });

    it("Should update proposed fee", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = 1000;

      {
        const [proposedDeadline, proposedFee] = await vault.proposedDepositFee();
        expect(proposedDeadline).to.eq(0);
        expect(proposedFee).to.eq(0);
      }

      await expect(vault.connect(admin).setDepositFee(fee)).to.emit(vault, "NewDepositFeeProposed").withArgs(fee);

      {
        const latestBlock = await ethers.provider.getBlock("latest");
        const feeTimeLock = await vault.FEE_TIME_LOCK();

        const [proposedDeadline, proposedFee] = await vault.proposedDepositFee();
        expect(proposedDeadline).to.eq(feeTimeLock.add(latestBlock.timestamp));
        expect(proposedFee).to.eq(fee);
      }
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
        "CoveredVault_FeeProposalNotFound",
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
        "CoveredVault_FeeProposalNotFound",
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
        "CoveredVault_FeeTimeLockNotDue",
      );

      await increase(BigNumber.from("60"));
      await vault.connect(admin).applyDepositFee();
    });

    it("Should change fee and reset proposed fee", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.3 * 1e4);
      const feeTimeLock = await vault.FEE_TIME_LOCK();

      const depositFeeBeforeSet = await vault.depositFee();
      expect(depositFeeBeforeSet).to.be.equal("0");

      await vault.connect(admin).setDepositFee(fee);

      const latestBlock = await ethers.provider.getBlock("latest");
      const [proposedDeadline, proposedFee] = await vault.proposedDepositFee();
      expect(proposedDeadline).to.eq(feeTimeLock.add(latestBlock.timestamp));
      expect(proposedFee).to.be.eq(fee);

      const depositFeeAfterSet = await vault.depositFee();
      expect(depositFeeAfterSet).to.be.equal("0");

      await increase(feeTimeLock);
      await vault.connect(admin).applyDepositFee();

      const depositFeeAfterApply = await vault.depositFee();
      expect(depositFeeAfterApply).to.be.equal(fee);

      const [resetDeadline, resetFee] = await vault.proposedDepositFee();
      expect(resetFee).to.be.eq("0");
      expect(resetDeadline).to.be.eq("0");
    });
  });

  describe("setManagementFee", function () {
    it("Should revert if not admin", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.5 * 1e4);
      const adminRole = await vault.DEFAULT_ADMIN_ROLE();

      await expect(vault.connect(user1).setManagementFee(fee)).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`,
      );

      await vault.connect(admin).setManagementFee(fee);
    });

    it("Should revert if proposed fee is bigger than 100%", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(1.1 * 1e4);

      await expect(vault.connect(admin).setManagementFee(fee)).to.revertedWithCustomError(
        vault,
        "CoveredVault_FeeOutOfBound",
      );
    });

    it("Should update proposed fee", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = 1000;

      {
        const [proposedDeadline, proposedFee] = await vault.proposedManagementFee();
        expect(proposedDeadline).to.eq(0);
        expect(proposedFee).to.eq(0);
      }

      await expect(vault.connect(admin).setManagementFee(fee)).to.emit(vault, "NewManagementFeeProposed").withArgs(fee);

      {
        const latestBlock = await ethers.provider.getBlock("latest");
        const feeTimeLock = await vault.FEE_TIME_LOCK();

        const [proposedDeadline, proposedFee] = await vault.proposedManagementFee();
        expect(proposedDeadline).to.eq(feeTimeLock.add(latestBlock.timestamp));
        expect(proposedFee).to.eq(fee);
      }
    });
  });

  describe("applyManagementFee", function () {
    it("Should revert if not admin", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.3 * 1e4);
      const timeLock = await vault.FEE_TIME_LOCK();
      const adminRole = await vault.DEFAULT_ADMIN_ROLE();

      await vault.connect(admin).setManagementFee(fee);

      await increase(timeLock);
      await expect(vault.connect(user1).applyManagementFee()).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`,
      );

      await vault.connect(admin).applyManagementFee();
    });

    it("Should revert if no proposed fee is found", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      await expect(vault.connect(admin).applyManagementFee()).to.revertedWithCustomError(
        vault,
        "CoveredVault_FeeProposalNotFound",
      );
    });

    it("Should revert after apply was called once", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.3 * 1e4);
      const timeLock = await vault.FEE_TIME_LOCK();

      await vault.connect(admin).setManagementFee(fee);

      await increase(timeLock);
      await vault.connect(admin).applyManagementFee();
      await expect(vault.connect(admin).applyManagementFee()).to.revertedWithCustomError(
        vault,
        "CoveredVault_FeeProposalNotFound",
      );
    });

    it("Should revert if deadline is not due", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.3 * 1e4);
      const timeLock = await vault.FEE_TIME_LOCK();

      await vault.connect(admin).setManagementFee(fee);

      await increase(timeLock.sub("60"));
      await expect(vault.connect(admin).applyManagementFee()).to.revertedWithCustomError(
        vault,
        "CoveredVault_FeeTimeLockNotDue",
      );

      await increase(BigNumber.from("60"));
      await vault.connect(admin).applyManagementFee();
    });

    it("Should change fee and reset proposed fee", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const fee = BigNumber.from(0.3 * 1e4);
      const feeTimeLock = await vault.FEE_TIME_LOCK();

      {
        const managementFee = await vault.managementFee();
        expect(managementFee).to.be.equal(0);
      }

      await vault.connect(admin).setManagementFee(fee);

      const latestBlock = await ethers.provider.getBlock("latest");
      const [proposedDeadline, proposedFee] = await vault.proposedManagementFee();
      expect(proposedDeadline).to.eq(feeTimeLock.add(latestBlock.timestamp));
      expect(proposedFee).to.be.eq(fee);

      {
        const managementFee = await vault.managementFee();
        expect(managementFee).to.be.equal(0);
      }

      await increase(feeTimeLock);
      await vault.connect(admin).applyManagementFee();

      {
        const managementFee = await vault.managementFee();
        expect(managementFee).to.be.equal(fee);
      }

      const [resetDeadline, resetFee] = await vault.proposedManagementFee();
      expect(resetFee).to.be.eq(0);
      expect(resetDeadline).to.be.eq(0);
    });

    it("Should accrue management fee", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const firstFee = BigNumber.from(0.3 * 1e4);
      const feeTimeLock = await vault.FEE_TIME_LOCK();
      const feeDenominator = await vault.FEE_DENOMINATOR();
      const feePeriod = await vault.FEE_MANAGER_PERIOD();

      await vault.connect(admin).setManagementFee(firstFee);
      await increase(feeTimeLock);
      await vault.connect(admin).applyManagementFee();

      const fee = BigNumber.from(0.5 * 1e4);

      await vault.connect(admin).setManagementFee(fee);
      await increase(feeTimeLock);
      await vault.connect(admin).applyManagementFee();

      const amount = parseEther("1000");
      await underlyingAsset.mint(user1.address, amount);
      await underlyingAsset.connect(user1).approve(vault.address, amount);
      await vault.connect(user1)["deposit(uint256,address)"](amount, user1.address);

      const latestBlock = await ethers.provider.getBlock("latest");
      const lastManagementFeesUpdate = await vault.lastManagementFeesUpdate();
      expect(lastManagementFeesUpdate).to.eq(latestBlock.timestamp);

      await vault.connect(admin).invest(amount);

      await vault.connect(admin).setManagementFee(fee);
      await increase(feeTimeLock);

      {
        const accumulatedUVSharesFees = await vault.accumulatedUVSharesFees();
        expect(accumulatedUVSharesFees).to.eq(0);
      }

      const feeAmount = amount.mul(feeTimeLock.add(2)).mul(fee).div(feeDenominator).div(feePeriod);
      await expect(vault.connect(admin).applyManagementFee())
        .to.emit(vault, "FeeAccrued")
        .withArgs(underlyingVault.address, feeAmount);

      {
        const latestBlock = await ethers.provider.getBlock("latest");
        const accumulatedUVSharesFees = await vault.accumulatedUVSharesFees();
        const lastManagementFeesUpdate = await vault.lastManagementFeesUpdate();
        expect(accumulatedUVSharesFees).to.eq(feeAmount);
        expect(lastManagementFeesUpdate).to.eq(latestBlock.timestamp);
      }
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
        "CoveredVault_NoFeesToClaim",
      );
    });

    it("Should transfer deposit fees to destination", async function () {
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

    it("Should transfer management fees to destination", async function () {
      const { vault, underlyingAsset, underlyingVault } = await loadFixture(deployVaultFixture);
      const [user1, destination, , admin] = await ethers.getSigners();

      const feeTimeLock = await vault.FEE_TIME_LOCK();

      const fee = BigNumber.from(0.5 * 1e4);

      await vault.connect(admin).setManagementFee(fee);
      await increase(feeTimeLock);
      await vault.connect(admin).applyManagementFee();

      const amount = parseEther("1000");
      await underlyingAsset.mint(user1.address, amount);
      await underlyingAsset.connect(user1).approve(vault.address, amount);
      await vault.connect(user1)["deposit(uint256,address)"](amount, user1.address);

      await vault.connect(admin).invest(amount);
      await increase(feeTimeLock);
      await vault.connect(admin).uninvest(amount);

      const initialBalance = await underlyingVault.balanceOf(destination.address);

      const accumulatedUVSharesFeesBefore = await vault.accumulatedUVSharesFees();
      expect(accumulatedUVSharesFeesBefore).to.gt(0);

      await vault.connect(admin).claimFees(destination.address);

      const balanceAfter = await underlyingVault.balanceOf(destination.address);
      const accumulatedUVSharesFeesAfter = await vault.accumulatedUVSharesFees();

      expect(balanceAfter).to.equal(initialBalance.add(accumulatedUVSharesFeesBefore));
      expect(accumulatedUVSharesFeesAfter).to.equal(0);
    });
  });

  describe("withdrawCoverManagerAssets", function () {
    it("Should revert if not admin", async function () {
      const { vault, coverManager, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("100");
      const adminRole = await vault.DEFAULT_ADMIN_ROLE();

      // deposit underlyingAsset
      await underlyingAsset.mint(user1.address, amount);
      await underlyingAsset.connect(user1).approve(coverManager.address, amount);
      await coverManager.connect(admin).addToAllowList(vault.address);

      await coverManager.connect(user1).depositOnBehalf(underlyingAsset.address, amount, vault.address);

      await expect(
        vault.connect(user1).withdrawCoverManagerAssets(underlyingAsset.address, amount, user1.address),
      ).to.be.revertedWith(`AccessControl: account ${user1.address.toLowerCase()} is missing role ${adminRole}`);

      await expect(vault.connect(admin).withdrawCoverManagerAssets(underlyingAsset.address, amount, user1.address)).to
        .not.be.reverted;
    });

    it("Should revert if `to` goes back to vault again", async function () {
      const { vault, coverManager, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("100");

      // deposit underlyingAsset
      await underlyingAsset.mint(user1.address, amount);
      await underlyingAsset.connect(user1).approve(coverManager.address, amount);
      await coverManager.connect(admin).addToAllowList(vault.address);

      await coverManager.connect(user1).depositOnBehalf(underlyingAsset.address, amount, vault.address);

      await expect(
        vault.connect(admin).withdrawCoverManagerAssets(underlyingAsset.address, amount, vault.address),
      ).to.be.revertedWithCustomError(vault, "CoveredVault_InvalidWithdrawAddress");
    });

    it("Should call withdraw", async function () {
      const { vault, coverManager, underlyingAsset } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const amount = ethers.utils.parseEther("100");

      // deposit underlyingAsset
      await underlyingAsset.mint(user1.address, amount);
      await underlyingAsset.connect(user1).approve(coverManager.address, amount);
      await coverManager.connect(admin).addToAllowList(vault.address);

      await coverManager.connect(user1).depositOnBehalf(underlyingAsset.address, amount, vault.address);

      const cmBalanceBefore = await underlyingAsset.balanceOf(coverManager.address);
      const user1BalanceBefore = await underlyingAsset.balanceOf(user1.address);

      await expect(vault.connect(admin).withdrawCoverManagerAssets(underlyingAsset.address, amount, user1.address));

      const cmBalanceAfter = await underlyingAsset.balanceOf(coverManager.address);
      const user1BalanceAfter = await underlyingAsset.balanceOf(user1.address);

      expect(cmBalanceAfter).to.be.eq(0);
      expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(cmBalanceBefore));
    });
  });

  describe("buyCover", function () {
    it("Should revert if not admin or operator", async function () {
      const { vault, coverManager } = await loadFixture(deployVaultFixture);
      const [user1, , , admin] = await ethers.getSigners();

      const operatorRole = await vault.OPERATOR_ROLE();
      const amount = parseEther("1000");

      await coverManager.connect(admin).addToAllowList(vault.address);
      await coverManager.connect(admin).depositETHOnBehalf(vault.address, { value: amount });

      await expect(vault.connect(user1).buyCover(amount.div(2), 0, amount.div(10), [])).to.be.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${operatorRole}`,
      );

      await expect(vault.connect(admin).buyCover(amount.div(2), 0, amount.div(10), [])).to.not.be.reverted;

      await vault.connect(admin).grantRole(operatorRole, user1.address);
      await vault.connect(user1).buyCover(amount.div(2), 0, amount.div(10), []);
      await expect(vault.connect(user1).buyCover(amount.div(2), 0, amount.div(10), [])).to.not.be.reverted;
    });

    it("Should revert if paused", async function () {
      const { vault, coverManager } = await loadFixture(deployVaultFixture);
      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");
      await vault.connect(admin).pause();

      await coverManager.connect(admin).addToAllowList(vault.address);
      await coverManager.connect(admin).depositETHOnBehalf(vault.address, { value: amount });

      await expect(vault.connect(admin).buyCover(amount.div(2), 0, amount.div(10), [])).to.be.revertedWith(
        "Pausable: paused",
      );
    });

    it("Should revert if amount to cover is lower than invested amount", async function () {
      const { coverManager, vault, underlyingAsset } = await loadFixture(deployVaultFixture);

      const [user1, , , admin] = await ethers.getSigners();

      const amount = parseEther("1000");

      await coverManager.connect(admin).addToAllowList(vault.address);
      await coverManager.connect(admin).depositETHOnBehalf(vault.address, { value: amount });

      await underlyingAsset.mint(user1.address, amount);

      await underlyingAsset.connect(user1).approve(vault.address, amount);
      await vault.connect(user1)["deposit(uint256,address)"](amount, user1.address);

      // invested: 0 with cover: amount/2
      await expect(vault.connect(admin).buyCover(amount.div(2), 0, amount.div(10), [])).to.not.be.reverted;

      // invested: amount with cover: amount/2
      await vault.connect(admin).invest(amount);
      await expect(vault.connect(admin).buyCover(amount.div(2), 0, amount.div(10), [])).to.be.revertedWithCustomError(
        vault,
        "CoveredVault_InvalidBuyCoverAmount",
      );
    });

    it("Should be able to increase covered amount", async function () {
      const { coverManager, vault, underlyingAsset } = await loadFixture(deployVaultFixture);

      const [user1, , , admin] = await ethers.getSigners();

      const amount = parseEther("100");

      await coverManager.connect(admin).addToAllowList(vault.address);
      await coverManager.connect(admin).depositETHOnBehalf(vault.address, { value: amount });

      await underlyingAsset.mint(user1.address, amount.mul(10));

      await underlyingAsset.connect(user1).approve(vault.address, amount.mul(10));
      await vault.connect(user1)["deposit(uint256,address)"](amount.mul(10), user1.address);

      await vault.connect(admin).invest(amount);
      const coverId0 = await vault.coverId();

      // invested: amout with cover: amount
      await expect(vault.connect(admin).buyCover(amount, 0, amount.div(10), [])).to.not.be.reverted;
      const coverId1 = await vault.coverId();

      // invested: amount with cover * 2
      await expect(vault.connect(admin).buyCover(amount.mul(2), 0, amount.div(10), [])).to.not.be.reverted;
      const coverId2 = await vault.coverId();

      // coverId should not change after increasing coverage
      expect(coverId1).to.be.eq(coverId2);

      // Was a new coverId
      expect(coverId0).to.eq(0);
    });

    it("Should change coverId if the previous one is expired", async function () {
      const { coverManager, vault, cover, underlyingAsset } = await loadFixture(deployVaultFixture);

      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("100");

      await coverManager.connect(admin).addToAllowList(vault.address);
      await coverManager.connect(admin).depositETHOnBehalf(vault.address, { value: amount });

      await underlyingAsset.mint(admin.address, amount.mul(10));

      await underlyingAsset.connect(admin).approve(vault.address, amount.mul(10));
      await vault.connect(admin)["deposit(uint256,address)"](amount.mul(10), admin.address);

      await vault.connect(admin).invest(amount);

      await cover.setMockSegments(false);

      await expect(vault.connect(admin).buyCover(amount.mul(2), 0, amount.div(10), [])).to.not.be.reverted;
      const coverId0 = await vault.coverId();

      const latestBlock = await ethers.provider.getBlock("latest");
      await cover.setSegments(1, [
        {
          amount,
          start: latestBlock.timestamp,
          period: 0, // next block will be expired
          gracePeriod: 0,
          globalRewardsRatio: 0,
          globalCapacityRatio: 0,
        },
      ]);

      await expect(vault.connect(admin).buyCover(amount.mul(3), 0, amount.div(10), [])).to.not.be.reverted;
      const coverId1 = await vault.coverId();

      // coverId should change if previous one was expired
      expect(coverId1).to.be.not.eq(coverId0);
    });

    it("Should set coverId and have coveredVault as owner of coverNFT", async function () {
      const { coverManager, vault, coverNFT } = await loadFixture(deployVaultFixture);

      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("100");

      await coverManager.connect(admin).addToAllowList(vault.address);
      await coverManager.connect(admin).depositETHOnBehalf(vault.address, { value: amount });

      const coverId0 = await vault.coverId();

      await expect(vault.connect(admin).buyCover(amount, 0, amount.div(10), [])).to.not.be.reverted;
      const coverId1 = await vault.coverId();

      // coverId should not change after increasing coverage
      expect(coverId1).to.be.not.eq(coverId0);

      // Was a new coverId
      expect(coverId0).to.eq(0);

      const owner = await coverNFT.ownerOf(coverId1);
      expect(owner).to.be.eq(vault.address);
    });

    it("Should emit CoverBought event", async function () {
      const { coverManager, vault } = await loadFixture(deployVaultFixture);

      const [, , , admin] = await ethers.getSigners();

      const amount = parseEther("100");

      await coverManager.connect(admin).addToAllowList(vault.address);
      await coverManager.connect(admin).depositETHOnBehalf(vault.address, { value: amount });

      const expectedCoverId = 1;
      const period = 100;
      await expect(vault.connect(admin).buyCover(amount, period, amount.div(10), []))
        .to.emit(vault, "CoverBought")
        .withArgs(admin.address, expectedCoverId, amount, period);
    });
  });

  describe("redeemCover", function () {
    it("Should revert if not admin or operator", async function () {
      const { vault } = await loadFixture(deployVaultFixture);

      const [user1] = await ethers.getSigners();

      const operatorRole = await vault.OPERATOR_ROLE();

      const depeggedTokens = await vault.underlyingVaultShares();

      const incidentId = 1;
      const segmentId = 0;
      await expect(vault.connect(user1).redeemCover(incidentId, segmentId, depeggedTokens, [])).to.revertedWith(
        `AccessControl: account ${user1.address.toLowerCase()} is missing role ${operatorRole}`,
      );
    });

    it("Should update idleAssets and UVShares", async function () {
      const { coverManager, cover, underlyingAsset, underlyingVault, yieldTokenIncidents, vault } = await loadFixture(
        deployVaultFixture,
      );

      const [user1, , , admin] = await ethers.getSigners();

      await coverManager.connect(admin).addToAllowList(vault.address);

      const payoutAmount = buyCoverParams.amount;
      await yieldTokenIncidents
        .connect(admin)
        .setPayoutAmount(payoutAmount, underlyingVault.address, underlyingAsset.address);

      const products = [
        { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
        { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
      ];

      await cover.setProducts(products);

      await coverManager.connect(user1).depositETHOnBehalf(vault.address, { value: buyCoverParams.amount });

      await vault
        .connect(admin)
        .buyCover(buyCoverParams.amount, buyCoverParams.period, buyCoverParams.maxPremiumInAsset, [poolAlloc]);

      await underlyingAsset.mint(user1.address, buyCoverParams.amount);
      await underlyingAsset.connect(user1).approve(vault.address, buyCoverParams.amount);
      await vault.connect(user1)["deposit(uint256,address)"](buyCoverParams.amount, user1.address);

      await vault.connect(admin).invest(buyCoverParams.amount);

      const underlyingAssetBefore = await underlyingAsset.balanceOf(vault.address);
      const underlyingVaultBefore = await underlyingVault.balanceOf(vault.address);
      const idleAssetsBefore = await vault.idleAssets();
      const underlyingVaultSharesBefore = await vault.underlyingVaultShares();
      const latestUvRateBefore = await vault.latestUvRate();

      const coverId = await cover.coverId();

      const depeggedTokens = await vault.underlyingVaultShares();

      const incidentId = 1;
      const segmentId = 0;
      await expect(vault.connect(admin).redeemCover(incidentId, segmentId, depeggedTokens, []))
        .to.emit(vault, "CoverRedeemed")
        .withArgs(admin.address, coverId, incidentId, segmentId, depeggedTokens, payoutAmount);

      const underlyingAssetAfter = await underlyingAsset.balanceOf(vault.address);
      const underlyingVaultAfter = await underlyingVault.balanceOf(vault.address);
      const idleAssetsAfter = await vault.idleAssets();
      const underlyingVaultSharesAfter = await vault.underlyingVaultShares();
      const latestUvRateAfter = await vault.latestUvRate();

      expect(underlyingAssetAfter).to.be.eq(underlyingAssetBefore.add(depeggedTokens));
      expect(underlyingVaultAfter).to.be.eq(underlyingVaultBefore.sub(payoutAmount));
      expect(idleAssetsAfter).to.be.eq(idleAssetsBefore.add(depeggedTokens));
      expect(underlyingVaultSharesAfter).to.be.eq(underlyingVaultSharesBefore.sub(payoutAmount));
      expect(latestUvRateBefore).to.not.equal(0);
      expect(latestUvRateAfter).to.equal(0);
    });
  });
});
