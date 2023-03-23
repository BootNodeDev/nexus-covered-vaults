const validate = (variable: string): string => {
  if (!process.env[variable]) {
    throw Error(`Missing process.env.${variable}`);
  }

  return process.env[variable] || "";
};

export const getCommonEnvs = () => {
  validate("GAS_PRICE");

  if (!process.env.VERIFY) {
    throw Error("Missing process.env.VERIFY");
  } else if (process.env.VERIFY == "true" && !process.env.ETHERSCAN_API_KEY) {
    throw Error("Missing process.env.ETHERSCAN_API_KEY");
  }

  return {
    verify: process.env.VERIFY,
  };
};

export const getCoverManagerEnvs = () => {
  const commonEnvs = getCommonEnvs();

  return {
    ...commonEnvs,
    pool: validate("CM_POOL"),
    cover: validate("CM_COVER"),
    yieldTokenIncidents: validate("CM_YIELD_TOKEN_INCIDENTS"),
    owner: validate("CM_OWNER"),
  };
};

export const getCoveredVaultEnvs = () => {
  const commonEnvs = getCommonEnvs();

  return {
    ...commonEnvs,
    factoryAddress: validate("CV_FACTORY"),
    name: validate("CV_NAME"),
    symbol: validate("CV_SYMBOL"),
    underlyingVault: validate("CV_UNDERLYING_VAULT"),
    admin: validate("CV_ADMIN"),
    maxAssetsLimit: validate("CV_MAX_ASSETS_LIMIT"),
    uvRateThreshold: validate("CV_UV_RATE_THRESHOLD"),
    productId: validate("CV_NEXUS_PRODUCT_ID"),
    coverAsset: validate("CV_NEXUS_COVER_ASSET_ID"),
    coverManager: validate("CV_COVER_MANAGER"),
    depositFee: validate("CV_DEPOSIT_FEE"),
    managementFee: validate("CV_MANAGEMENT_FEE"),
  };
};
