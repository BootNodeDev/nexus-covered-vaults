import { expect } from "chai";
import { ethers } from "hardhat";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import {
  ERC4626Mock,
  ERC20Mock,
  YieldTokenIncidentsMock,
  CoverNFTMock,
  CoverMock,
  CoverManager,
  CoveredVaultFactory,
} from "../../typechain-types";

const { parseEther } = ethers.utils;

const vaultName = "USDC Covered Vault";
const vaultSymbol = "cvUSDC";

type VaultFixture = Promise<{
  underlyingVault: ERC4626Mock;
  underlyingAsset: ERC20Mock;
}>;

export async function deployUnderlyingVaultFixture(): VaultFixture {
  const underlyingAsset = await ethers.deployContract("ERC20Mock", ["USDC", "USDC"]);
  const underlyingVault = await ethers.deployContract("ERC4626Mock", [
    underlyingAsset.address,
    "USDC Invest Vault",
    "ivUSDC",
  ]);

  return { underlyingVault, underlyingAsset } as unknown as VaultFixture;
}

export const deployVaultFixture = async () => deployVaultFixtureCreator();

async function deployVaultFixtureCreator(depositFee = 0, managementFee = 0) {
  const { underlyingVault, underlyingAsset } = await deployUnderlyingVaultFixture();
  const { vaultFactory } = await deployVaultFactoryFixture();
  const { coverManager } = await deployCoverManager();

  const [, , , admin] = await ethers.getSigners();

  let vaultAddress: string = "";

  await expect(
    vaultFactory.create(
      underlyingVault.address,
      vaultName,
      vaultSymbol,
      admin.address,
      ethers.constants.MaxUint256,
      10000,
      1,
      0,
      coverManager.address,
      depositFee,
      managementFee,
    ),
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
  const vaultFactory = (await ethers.deployContract("CoveredVaultFactory")) as CoveredVaultFactory;

  return { vaultFactory };
}

type CoverManagerFixture = Promise<{
  yieldTokenIncidents: YieldTokenIncidentsMock;
  underlyingAsset: ERC20Mock;
  coverNFT: CoverNFTMock;
  cover: CoverMock;
  coverManager: CoverManager;
}>;
export async function deployCoverManager() {
  const [, , , , owner] = await ethers.getSigners();

  const yieldTokenIncidents = await ethers.deployContract("YieldTokenIncidentsMock");
  const underlyingAsset = await ethers.deployContract("ERC20Mock", ["DAI", "DAI"]);
  const pool = await ethers.deployContract("PoolMock", [underlyingAsset.address]);
  const coverNFT = await ethers.deployContract("CoverNFTMock", ["coverNFT", "coverNFT"]);
  const cover = await ethers.deployContract("CoverMock", [pool.address, coverNFT.address]);
  const coverManager = await ethers.deployContract(
    "CoverManager",
    [cover.address, yieldTokenIncidents.address, pool.address],
    owner,
  );

  await setBalance(coverManager.address, ethers.utils.parseEther("1000"));
  await setBalance(cover.address, ethers.utils.parseEther("1000"));

  return { coverManager, cover, yieldTokenIncidents, underlyingAsset, coverNFT } as unknown as CoverManagerFixture;
}

export async function mintVaultSharesFixture() {
  const { vault, underlyingVault, underlyingAsset } = await deployVaultFixture();
  const [user1, user2] = await ethers.getSigners();

  // Mint assets to users
  const userAmount = parseEther("10000");
  await underlyingAsset.mint(user1.address, userAmount);
  await underlyingAsset.mint(user2.address, userAmount);

  await underlyingAsset.connect(user1).approve(vault.address, userAmount);
  await underlyingAsset.connect(user2).approve(vault.address, userAmount);

  const depositAmount = parseEther("1000");
  await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

  return { vault, underlyingVault, underlyingAsset };
}
