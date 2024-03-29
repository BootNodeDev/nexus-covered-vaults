// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { ICoverManager } from "./interfaces/ICoverManager.sol";
import { CoveredVault } from "./CoveredVault.sol";

/**
 * @title CoveredVaultFactory
 * @dev Factory to deploy new CoveredVault instances
 */
contract CoveredVaultFactory {
  event CoveredVaultCreated(address indexed vault);

  /**
   * @dev Deploys a new CoveredVault
   * @param _underlyingVault Underlying vault ERC4626-compatible contract
   * @param _name Name of the vault
   * @param _symbol Symbol of the vault
   * @param _admin address' admin operator
   * @param _maxAssetsLimit New maximum asset amount limit
   * @param _uvRateThreshold Underlying vault exchange rate update threshold
   * @param _productId productId to cover
   * @param _coverAsset id of nexus cover asset
   * @param _coverManager CoverManager used to interact with Nexus
   * @param _depositFee Fee for new deposits
   * @param _managementFee Fee for managed assets
   */
  function create(
    IERC4626 _underlyingVault,
    string memory _name,
    string memory _symbol,
    address _admin,
    uint256 _maxAssetsLimit,
    uint256 _uvRateThreshold,
    uint24 _productId,
    uint8 _coverAsset,
    ICoverManager _coverManager,
    uint256 _depositFee,
    uint256 _managementFee
  ) external returns (address) {
    CoveredVault vault = new CoveredVault(
      _underlyingVault,
      _name,
      _symbol,
      _admin,
      _maxAssetsLimit,
      _uvRateThreshold,
      _productId,
      _coverAsset,
      _coverManager,
      _depositFee,
      _managementFee
    );

    emit CoveredVaultCreated(address(vault));

    return address(vault);
  }
}
