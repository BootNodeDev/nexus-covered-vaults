import { deployContract, etherscanVerification } from "../helpers/contract";
import { getCommonEnvs } from "../helpers/envValidation";

async function deployCoveredVaultFactory() {
  const { verify } = getCommonEnvs();

  const coveredVaultFactory = await deployContract("CoveredVaultFactory", []);

  if (verify == "true") {
    await etherscanVerification(coveredVaultFactory.address, []);
  }

  console.log("\nCovered Vault Factory: ", coveredVaultFactory.address);

  console.log("\nDeployment complete!");
}

deployCoveredVaultFactory()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
