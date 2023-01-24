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

  const CoveredVault = await ethers.getContractFactory("CoveredVault");
  const vault = CoveredVault.attach(vaultAddress);

  return { vault, underlyingVault, underlyingAsset };
}

export async function deployVaultFactoryFixture() {
  const CoveredVaultFactory = await ethers.getContractFactory("CoveredVaultFactory");
  const vaultFactory = await CoveredVaultFactory.deploy();

  return { vaultFactory };
}

export async function deployCoverManager() {
  const CoverManager = await ethers.getContractFactory("CoverManager");
  const CoverMock = await ethers.getContractFactory("CoverMock");
  const YieldTokenIncidentsMock = await ethers.getContractFactory("YieldTokenIncidentsMock");
  const PoolMock = await ethers.getContractFactory("PoolMock");

  const [, , , , kycUser] = await ethers.getSigners();

  const cover = await CoverMock.deploy();
  const yieldTokenIncidents = await YieldTokenIncidentsMock.deploy();
  const pool = await PoolMock.deploy();

  const coverManager = await CoverManager.connect(kycUser).deploy(
    cover.address,
    yieldTokenIncidents.address,
    pool.address,
  );

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
