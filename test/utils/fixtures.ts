import { expect } from "chai";
import { ethers } from "hardhat";

const vaultName = "USDC Covered Vault";
const vaultSymbol = "cvUSDC";

export async function deployUnderlyingVaultFixture() {
  const underlyingAsset = await ethers.deployContract("ERC20Mock", ["USDC", "USDC"]);
  const underlyingVault = await ethers.deployContract("ERC4626Mock", [
    underlyingAsset.address,
    "USDC Invest Vault",
    "ivUSDC",
  ]);

  return { underlyingVault, underlyingAsset };
}

export async function deployVaultFixture() {
  const { underlyingVault, underlyingAsset } = await deployUnderlyingVaultFixture();
  const { vaultFactory } = await deployVaultFactoryFixture();
  const [, , , admin] = await ethers.getSigners();

  let vaultAddress: string = "";

  await expect(
    vaultFactory.create(underlyingVault.address, vaultName, vaultSymbol, admin.address, ethers.constants.MaxUint256),
  )
    .to.emit(vaultFactory, "CoveredVaultCreated")
    .withArgs((createdAddress: string) => {
      vaultAddress = createdAddress;
      return true;
    });

  const vault = await ethers.getContractAt("CoveredVault", vaultAddress);

  return { vault, underlyingVault, underlyingAsset };
}

export async function deployVaultFactoryFixture() {
  const vaultFactory = await ethers.deployContract("CoveredVaultFactory");

  return { vaultFactory };
}

export async function deployCoverManager() {
  const [, , , , owner] = await ethers.getSigners();

  const cover = await ethers.deployContract("CoverMock");
  const yieldTokenIncidents = await ethers.deployContract("YieldTokenIncidentsMock");

  const coverManager = await ethers.deployContract("CoverManager", [cover.address, yieldTokenIncidents.address], owner);

  return { coverManager, cover, yieldTokenIncidents };
}

export async function mintVaultSharesFixture() {
  const { vault, underlyingVault, underlyingAsset } = await deployVaultFixture();
  const [user1, user2] = await ethers.getSigners();

  // Mint assets to users
  await underlyingAsset.mint(user1.address, ethers.utils.parseEther("10000"));
  await underlyingAsset.mint(user2.address, ethers.utils.parseEther("10000"));
  await underlyingAsset.connect(user1).approve(vault.address, ethers.utils.parseEther("10000"));
  await underlyingAsset.connect(user2).approve(vault.address, ethers.utils.parseEther("10000"));

  await vault.connect(user1)["deposit(uint256,address)"](ethers.utils.parseEther("1000"), user1.address);

  return { vault, underlyingVault, underlyingAsset };
}
