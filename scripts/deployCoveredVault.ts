import { ethers } from "hardhat";
import { etherscanVerification, getEventArgs } from "../helpers/contract";
import { getCoveredVaultEnvs } from "../helpers/envValidation";
import { CoveredVaultFactory } from "../typechain-types";

async function deployCoveredVault() {
  const {
    factoryAddress,
    coverManager,
    name,
    symbol,
    underlyingVault,
    admin,
    maxAssetsLimit,
    uvRateThreshold,
    productId,
    coverAsset,
    depositFee,
    managementFee,
    verify,
  } = getCoveredVaultEnvs();

  const coveredVaultArgs = [
    underlyingVault,
    name,
    symbol,
    admin,
    maxAssetsLimit,
    uvRateThreshold,
    productId,
    coverAsset,
    coverManager,
    depositFee,
    managementFee,
  ];

  const factory = (await ethers.getContractAt("CoveredVaultFactory", factoryAddress)) as CoveredVaultFactory;

  console.log(`\nDeploying a new Covered Vault...`);
  const createTx = await factory.create(
    underlyingVault,
    name,
    symbol,
    admin,
    maxAssetsLimit,
    uvRateThreshold,
    productId,
    coverAsset,
    coverManager,
    depositFee,
    managementFee,
  );
  console.log("Tx:", createTx.hash);
  const txReceipt = await createTx.wait();

  const coveredVaultAddress = getEventArgs(txReceipt, "CoveredVaultCreated").vault;

  if (verify === "true") {
    await etherscanVerification(coveredVaultAddress, coveredVaultArgs);
  }

  console.log("\nCovered Vault: ", coveredVaultAddress);

  console.log("\nDeployment complete!");
}

deployCoveredVault()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
