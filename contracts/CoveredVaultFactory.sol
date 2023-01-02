// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { CoveredVault } from "./CoveredVault.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";

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
   * @param _depositFee Fee for new deposits 
   * @param _timeLockDepositFee Timelock for changes in depositFee after construction
   */
  function create(
    IERC4626 _underlyingVault,
    string memory _name,
    string memory _symbol,
    address _admin,
    uint256 _maxAssetsLimit,
    uint256 _depositFee,
    uint256 _timeLockDepositFee
  ) external returns (address) {
    CoveredVault vault = new CoveredVault(_underlyingVault, _name, _symbol, _admin, _maxAssetsLimit, _depositFee, _timeLockDepositFee);

    emit CoveredVaultCreated(address(vault));

    return address(vault);
  }
}
