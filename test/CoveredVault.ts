import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const vaultName = "USDC Covered Vault";
const vaultSymbol = "cvUSDC";

describe("CoveredVault", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployVaultFixture() {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const ERC4626Mock = await ethers.getContractFactory("ERC4626Mock");
    const CoveredVault = await ethers.getContractFactory("CoveredVault");

    const underlyingAsset = await ERC20Mock.deploy("USDC", "USDC");
    const underlyingVault = await ERC4626Mock.deploy(underlyingAsset.address, "USDC Invest Vault", "ivUSDC");
    const vault = await CoveredVault.deploy(underlyingVault.address, vaultName, vaultSymbol);

    return { vault, underlyingVault, underlyingAsset };
  }

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
});
