import { expect } from "chai";
import { ethers } from "hardhat";
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

export const deployScenariosFixture = async () => {
  const [, , , admin] = await ethers.getSigners();

  const { vault, underlyingVault, underlyingAsset, cover, coverNFT, yieldTokenIncidents, coverManager } =
    await deployVaultFixtureCreator(1);

  const product = {
    productType: 1,
    yieldTokenAddress: ethers.constants.AddressZero,
    coverAssets: 0,
    initialPriceRatio: 4,
    capacityReductionRatio: 1,
    isDeprecated: false,
    useFixedPrice: true,
  };

  const productParam = {
    productName: "test",
    productId: 1,
    ipfsMetadata: "",
    product,
    allowedPools: [],
  };

  const products = [
    { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
    { ...productParam, product: { ...product, yieldTokenAddress: underlyingVault.address } },
  ];

  await cover.setProducts(products);

  await coverManager.connect(admin).addToAllowList(vault.address);

  const amount = parseEther("10000");
  await underlyingAsset.mint(admin.address, amount);
  await underlyingAsset.connect(admin).approve(coverManager.address, amount);
  await coverManager.connect(admin).depositOnBehalf(underlyingAsset.address, amount, vault.address);

  await underlyingAsset.mint(yieldTokenIncidents.address, amount);

  await vault.connect(admin).setUnderlyingVaultRateThreshold(3000); //30%

  return { vault, underlyingVault, underlyingAsset, cover, coverNFT, yieldTokenIncidents, coverManager };
};

async function deployVaultFixtureCreator(coverAsset = 0) {
  const { underlyingVault, underlyingAsset } = await deployUnderlyingVaultFixture();
  const { vaultFactory } = await deployVaultFactoryFixture();
  const { coverManager, cover, coverNFT, yieldTokenIncidents } = await deployCoverManager(underlyingAsset);
  const depositFee = 0;
  const managementFee = 0;

  const [, , , admin] = await ethers.getSigners();

  let vaultAddress: string = "";
  const maxAssetsLimit = parseEther("1000000000");

  await expect(
    vaultFactory.create(
      underlyingVault.address,
      vaultName,
      vaultSymbol,
      admin.address,
      maxAssetsLimit,
      10000,
      1,
      coverAsset,
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

  await underlyingAsset.mint(yieldTokenIncidents.address, ethers.utils.parseEther("1000"));
  const vault = await ethers.getContractAt("CoveredVault", vaultAddress);

  return { vault, underlyingVault, underlyingAsset, cover, coverNFT, yieldTokenIncidents, coverManager };
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

export async function deployCoverManager(underlyingAsset: ERC20Mock) {
  const [, , , owner] = await ethers.getSigners();

  const yieldTokenIncidents = await ethers.deployContract("YieldTokenIncidentsMock");
  const pool = await ethers.deployContract("PoolMock", [underlyingAsset.address]);
  const coverNFT = await ethers.deployContract("CoverNFTMock", ["coverNFT", "coverNFT"]);
  const cover = await ethers.deployContract("CoverMock", [pool.address, coverNFT.address]);
  const coverManager = await ethers.deployContract(
    "CoverManager",
    [cover.address, yieldTokenIncidents.address, pool.address],
    owner,
  );

  return { coverManager, cover, yieldTokenIncidents, underlyingAsset, coverNFT } as unknown as CoverManagerFixture;
}

export async function mintVaultSharesFixture() {
  const { vault, underlyingVault, underlyingAsset, cover } = await deployVaultFixture();
  const [user1, user2] = await ethers.getSigners();

  // Mint assets to users
  const userAmount = parseEther("10000");
  await underlyingAsset.mint(user1.address, userAmount);
  await underlyingAsset.mint(user2.address, userAmount);

  await underlyingAsset.connect(user1).approve(vault.address, userAmount);
  await underlyingAsset.connect(user2).approve(vault.address, userAmount);

  const depositAmount = parseEther("1000");
  await vault.connect(user1)["deposit(uint256,address)"](depositAmount, user1.address);

  return { vault, underlyingVault, underlyingAsset, cover };
}
