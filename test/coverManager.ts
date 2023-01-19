import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoverManager } from "./utils/fixtures";

describe("CoverManager", function () {
  describe("Deployment", function () {
    it("Should correctly set params", async function () {
      const { cover, coverManager, yieldTokenIncidents } = await loadFixture(deployCoverManager);

      expect(await coverManager.coverContract()).to.equal(cover.address);
      expect(await coverManager.yieldTokenIncidentContract()).to.equal(yieldTokenIncidents.address);
    });
  });

  describe("Access Control", function () {
    it("Should give owner rights to deployer", async function () {
      const { coverManager } = await loadFixture(deployCoverManager);

      const [, , , , kycUser] = await ethers.getSigners();

      expect(await coverManager.owner()).to.equals(kycUser.address);
    });

    it("Should revert if allowCaller is called by anybody but owner", async function () {
      const { coverManager } = await loadFixture(deployCoverManager);
      const [user1, user2, , , kycUser] = await ethers.getSigners();

      await expect(coverManager.connect(user1).allowCaller(user2.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      await expect(coverManager.connect(kycUser).allowCaller(user2.address)).to.not.be.reverted;
    });

    it("Should revert if disallowCaller is called by anybody but owner", async function () {
      const { coverManager } = await loadFixture(deployCoverManager);
      const [user1, user2, , , kycUser] = await ethers.getSigners();

      await expect(coverManager.connect(user1).disallowCaller(user2.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      await expect(coverManager.connect(kycUser).allowCaller(user2.address)).to.not.be.reverted;
    });
  });

  describe("allowed callers", function () {
    it("Should revert if is already allowed", async function () {
      const { coverManager } = await loadFixture(deployCoverManager);
      const [user1, , , , kycUser] = await ethers.getSigners();

      await coverManager.connect(kycUser).allowCaller(user1.address);
      await expect(coverManager.connect(kycUser).allowCaller(user1.address)).to.be.revertedWithCustomError(
        coverManager,
        "AlreadyAllowed",
      );
    });

    it("Should revert if is already disallowed", async function () {
      const { coverManager } = await loadFixture(deployCoverManager);
      const [user1, , , , kycUser] = await ethers.getSigners();

      await expect(coverManager.connect(kycUser).disallowCaller(user1.address)).to.be.revertedWithCustomError(
        coverManager,
        "AlreadyDisallowed",
      );
    });
  });
});
