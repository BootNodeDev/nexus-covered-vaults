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

export const deployVaultFixture = async () => deployVaultFixtureCreator();

async function deployVaultFixtureCreator(fee = 0) {
  const { underlyingVault, underlyingAsset } = await deployUnderlyingVaultFixture();
  const { vaultFactory } = await deployVaultFactoryFixture();
  const [, , , admin] = await ethers.getSigners();

  let vaultAddress: string = "";
  const depositFee = fee * 1e4;

  await expect(
    vaultFactory.create(
      underlyingVault.address,
      vaultName,
      vaultSymbol,
      admin.address,
      ethers.constants.MaxUint256,
      depositFee,
    ),
  )
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
