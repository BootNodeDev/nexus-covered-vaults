import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { zeroAddress } from "@nomicfoundation/ethereumjs-util";

describe("CoveredVault", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployVaultFixture() {
    const CoveredVault = await ethers.getContractFactory("CoveredVault");
    const vault = await CoveredVault.deploy();

    return { vault };
  }

  describe("Deployment", function () {
    it("Should work", async function () {
      const { vault } = await loadFixture(deployVaultFixture);

      expect(await vault.address).to.not.equal(zeroAddress);
    });
  });
});
