import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { deployVaultFactoryFixture, deployUnderlyingVaultFixture } from "./utils/fixtures";

const vaultName = "USDC Covered Vault";
const vaultSymbol = "cvUSDC";

describe("CoveredVaultFactory", function () {
  describe("create", function () {
    it("Should deploy a new vault", async function () {
      const { underlyingVault, underlyingAsset } = await loadFixture(deployUnderlyingVaultFixture);
      const { vaultFactory } = await loadFixture(deployVaultFactoryFixture);
      const [, , , admin] = await ethers.getSigners();
      let vaultAddress: string = "";
      const depositFee = 0.3 * 1e4; // 3%
      const managementFee = 0.5 * 1e4; // 5%
      const productId = 1;
      const coverAsset = 2;
      const uvRateThreshold = 2000; // 20%

      // deploy new vault
      await expect(
        vaultFactory.create(
          underlyingVault.address,
          vaultName,
          vaultSymbol,
          admin.address,
          ethers.constants.MaxUint256,
          uvRateThreshold,
          productId,
          coverAsset,
          ethers.constants.AddressZero,
          depositFee,
          managementFee,
        ),
      )
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
      expect(await vault.maxAssetsLimit()).to.equal(ethers.constants.MaxUint256);
      expect(await vault.depositFee()).to.equal(depositFee);
      expect(await vault.managementFee()).to.equal(managementFee);
      expect(await vault.productId()).to.equal(productId);
      expect(await vault.coverAsset()).to.equal(coverAsset);
      expect(await vault.uvRateThreshold()).to.equal(uvRateThreshold);

      // erc4626 properties
      expect(await vault.asset()).to.equal(underlyingAsset.address);

      // erc20 properties
      expect(await vault.name()).to.equal(vaultName);
      expect(await vault.symbol()).to.equal(vaultSymbol);
      expect(await vault.decimals()).to.equal(await underlyingAsset.decimals());
    });
  });
});
