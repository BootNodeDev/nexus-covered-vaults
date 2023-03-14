import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoverManager } from "./utils/fixtures";
import { setNextBlockBaseFeePerGas } from "@nomicfoundation/hardhat-network-helpers";

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

describe("CoverManager", function () {
  describe("Deployment", function () {
    it("Should correctly set params", async function () {
      const { cover, coverManager, yieldTokenIncidents } = await loadFixture(deployCoverManager);

      expect(await coverManager.cover()).to.equal(cover.address);
      expect(await coverManager.yieldTokenIncident()).to.equal(yieldTokenIncidents.address);
    });
  });

  describe("Access Control", function () {
    it("Should give owner rights to deployer", async function () {
      const { coverManager } = await loadFixture(deployCoverManager);

      const [, , , , owner] = await ethers.getSigners();

      expect(await coverManager.owner()).to.equals(owner.address);
    });

    it("Should revert if addToAllowList is called by anybody but owner", async function () {
      const { coverManager } = await loadFixture(deployCoverManager);
      const [user1, user2, , , owner] = await ethers.getSigners();

      await expect(coverManager.connect(user1).addToAllowList(user2.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      await expect(coverManager.connect(owner).addToAllowList(user2.address)).to.not.be.reverted;
    });

    it("Should revert if removeFromAllowList is called by anybody but owner", async function () {
      const { coverManager } = await loadFixture(deployCoverManager);
      const [user1, user2, , , owner] = await ethers.getSigners();

      await expect(coverManager.connect(user1).removeFromAllowList(user2.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      await expect(coverManager.connect(owner).addToAllowList(user2.address)).to.not.be.reverted;
    });
  });

  describe("allowed callers", function () {
    it("Should revert if is already allowed", async function () {
      const { coverManager } = await loadFixture(deployCoverManager);
      const [user1, , , , owner] = await ethers.getSigners();

      await coverManager.connect(owner).addToAllowList(user1.address);
      await expect(coverManager.connect(owner).addToAllowList(user1.address)).to.be.revertedWithCustomError(
        coverManager,
        "CoverManager_AlreadyAllowed",
      );
    });

    it("Should revert if is already disallowed", async function () {
      const { coverManager } = await loadFixture(deployCoverManager);
      const [user1, , , , owner] = await ethers.getSigners();

      await expect(coverManager.connect(owner).removeFromAllowList(user1.address)).to.be.revertedWithCustomError(
        coverManager,
        "CoverManager_AlreadyDisallowed",
      );
    });
  });

  describe("Buy Cover", function () {
    it("Should succeed if is called with an ERC20 or ETH", async () => {
      const { coverManager, underlyingAsset } = await loadFixture(deployCoverManager);
      const [user1, , , , kycUser] = await ethers.getSigners();

      await coverManager.connect(kycUser).addToAllowList(user1.address);
      await underlyingAsset.mint(kycUser.address, buyCoverParams.amount);
      await underlyingAsset.connect(kycUser).approve(coverManager.address, buyCoverParams.amount);
      await coverManager
        .connect(kycUser)
        .depositOnBehalf(underlyingAsset.address, buyCoverParams.amount, user1.address);

      await expect(coverManager.connect(user1).buyCover({ ...buyCoverParams, paymentAsset: 1 }, [poolAlloc])).to.not.be
        .reverted;

      await coverManager.connect(kycUser).depositETHOnBehalf(user1.address, { value: buyCoverParams.amount });
      await coverManager.connect(user1).buyCover({ ...buyCoverParams, paymentAsset: 0 }, [poolAlloc]);
      await expect(coverManager.connect(user1).buyCover({ ...buyCoverParams, paymentAsset: 0 }, [poolAlloc])).to.not.be
        .reverted;
    });

    xit("Should return to sender amount not spent in ETH", async () => {
      const { coverManager, cover } = await loadFixture(deployCoverManager);
      const [user1, , , , kycUser] = await ethers.getSigners();

      await coverManager.connect(kycUser).addToAllowList(user1.address);

      const balanceBefore = await user1.getBalance();

      await setNextBlockBaseFeePerGas(0);
      await coverManager.connect(user1).buyCover({ ...buyCoverParams, paymentAsset: 0 }, [poolAlloc], {
        value: buyCoverParams.amount.mul(2),
        gasPrice: 0,
      });

      const balanceAfter = await user1.getBalance();
      const premium = await cover.premium();
      const PREMIUM_DENOMINATOR = await cover.PREMIUM_DENOMINATOR();
      const premiumAmount = buyCoverParams.amount.mul(premium).div(PREMIUM_DENOMINATOR);

      expect(balanceAfter).to.be.eq(balanceBefore.sub(premiumAmount));
    });

    xit("Should return to sender amount not spent in asset", async () => {
      const { coverManager, cover, underlyingAsset } = await loadFixture(deployCoverManager);
      const [user1, , , , kycUser] = await ethers.getSigners();

      await coverManager.connect(kycUser).addToAllowList(user1.address);
      await underlyingAsset.mint(user1.address, ethers.utils.parseEther("10000"));
      await underlyingAsset.connect(user1).approve(coverManager.address, ethers.utils.parseEther("10000"));

      const balanceBefore = await underlyingAsset.balanceOf(user1.address);

      await setNextBlockBaseFeePerGas(0);
      await coverManager.connect(user1).buyCover({ ...buyCoverParams, paymentAsset: 1 }, [poolAlloc], {
        value: 0,
        gasPrice: 0,
      });

      const balanceAfter = await underlyingAsset.balanceOf(user1.address);

      const premium = await cover.premium();
      const PREMIUM_DENOMINATOR = await cover.PREMIUM_DENOMINATOR();
      const premiumAmount = buyCoverParams.amount.mul(premium).div(PREMIUM_DENOMINATOR);

      expect(balanceAfter).to.be.eq(balanceBefore.sub(premiumAmount));
    });
  });
});
