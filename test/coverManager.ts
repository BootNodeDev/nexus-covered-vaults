import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoverManager } from "./utils/fixtures";

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
});
