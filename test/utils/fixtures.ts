import { expect } from "chai";
import { ethers } from "hardhat";

const vaultName = "USDC Covered Vault";
const vaultSymbol = "cvUSDC";

export async function deployUnderlyingVaultFixture() {
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  const ERC4626Mock = await ethers.getContractFactory("ERC4626Mock");

  const underlyingAsset = await ERC20Mock.deploy("USDC", "USDC");
  const underlyingVault = await ERC4626Mock.deploy(underlyingAsset.address, "USDC Invest Vault", "ivUSDC");

  return { underlyingVault, underlyingAsset };
}

export async function deployVaultFixture() {
  const { underlyingVault, underlyingAsset } = await deployUnderlyingVaultFixture();
  const { vaultFactory } = await deployVaultFactoryFixture();

  let vaultAddress: string = "";
  await expect(vaultFactory.create(underlyingVault.address, vaultName, vaultSymbol))
    .to.emit(vaultFactory, "CoveredVaultCreated")
    .withArgs((createdAddress: string) => {
      vaultAddress = createdAddress;
      return true;
    });

  const CoveredVault = await ethers.getContractFactory("CoveredVault");
  const vault = CoveredVault.attach(vaultAddress);

  return { vault, underlyingVault, underlyingAsset };
}

export async function deployVaultFactoryFixture() {
  const CoveredVaultFactory = await ethers.getContractFactory("CoveredVaultFactory");
  const vaultFactory = await CoveredVaultFactory.deploy();

  return { vaultFactory };
}
