import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const vaultName = "USDC Covered Vault";
const vaultSymbol = "cvUSDC";

describe("CoveredVaultFactory", function () {
  async function deployVaultFixture() {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const ERC4626Mock = await ethers.getContractFactory("ERC4626Mock");
    const CoveredVaultFactory = await ethers.getContractFactory("CoveredVaultFactory");

    const underlyingAsset = await ERC20Mock.deploy("USDC", "USDC");
    const underlyingVault = await ERC4626Mock.deploy(underlyingAsset.address, "USDC Invest Vault", "ivUSDC");
    const vaultFactory = await CoveredVaultFactory.deploy();

    return { vaultFactory, underlyingVault, underlyingAsset };
  }

  describe("create", function () {
    it("Should deploy a new vault", async function () {
      const { vaultFactory, underlyingVault, underlyingAsset } = await loadFixture(deployVaultFixture);

      let vaultAddress: string = "";

      // deploy new vault
      await expect(vaultFactory.create(underlyingVault.address, vaultName, vaultSymbol))
        .to.emit(vaultFactory, "CoveredVaultCreated")
        .withArgs((createdAddress: string) => {
          vaultAddress = createdAddress;
          return true;
        });

      expect(vaultAddress).to.not.equal(ethers.constants.AddressZero);

      const CoveredVault = await ethers.getContractFactory("CoveredVault");
      const vault = CoveredVault.attach(vaultAddress);

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
