// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { AccessManager } from "./AccessManager.sol";

/**
 * @title FeeManager
 * @dev Implements logic related to the vault fees
 */
abstract contract FeeManager is AccessManager {
  using SafeERC20 for IERC20;

  struct ProposedDepositFee {
    uint256 deadline;
    uint256 newFee;
  }

  /**
   *  @dev Timelock for depositFee application
   */
  uint256 public constant FEE_TIME_LOCK = 2 weeks;

  /**
   * @dev fee denominator 100% with two decimals
   */
  uint256 public constant FEE_DENOMINATOR = 100_00;

  /**
   * @dev Period over which management fee are calculated
   */
  uint256 public constant FEE_MANAGER_PERIOD = 365 days;

  /**
   * @dev Amount of accumulated fees in asset for the admin to claim
   */
  uint256 public accumulatedAssetFees;

  /**
   * @dev Amount of accumulated fees in underlying vault shares for the admin to claim
   */
  uint256 public accumulatedUVSharesFees;

  /**
   * @dev Percentage charged to users on deposit.
   * Helps to avoid short term deposits.
   * After construction is updated with `setDepositFee` and have effect after `applyDepositFee` is called with timelock due.
   */
  uint256 public depositFee;

  /**
   * @dev Annually percentage fee charged on invested assets.
   * After construction is updated with `setManagementFee` and have effect after `applyManagementFee` is called with timelock due.
   */
  uint256 public managementFee;

  /**
   * @dev Tracks the last timestamp until management fees were accrued
   */
  uint256 public lastManagementFeesUpdate;

  /**
   * @dev New proposed deposit fee
   */
  ProposedDepositFee public proposedDepositFee;

  /**
   * @dev New proposed management fee
   */
  ProposedDepositFee public proposedManagementFee;

  /* ========== Events ========== */

  /**
   * @dev Emitted when the deposit fee is set to be changed
   */
  event NewDepositFeeProposed(uint256 newFee);

  /**
   * @dev Emitted when the deposit fee changes effectively
   */
  event DepositFeeUpdated(uint256 newFee);

  /**
   * @dev Emitted when the management fee is set to be changed
   */
  event NewManagementFeeProposed(uint256 newFee);

  /**
   * @dev Emitted when the management fee changes effectively
   */
  event ManagementFeeUpdated(uint256 newFee);

  /**
   * @dev Emitted when the assets are accounted as fee for the manager
   */
  event FeeAccrued(address asset, uint256 amount);

  /* ========== Custom Errors ========== */

  error CoveredVault__FeeOutOfBound();
  error CoveredVault__FeeProposalNotFound();
  error CoveredVault__FeeTimeLockNotDue();
  error CoveredVault__NoFeesToClaim();

  /**
   * @dev Set fees initial parameters
   * @param _admin address of admin operator
   * @param _depositFee Fee for new deposits
   * @param _managementFee Fee for managed assets
   */
  constructor(address _admin, uint256 _depositFee, uint256 _managementFee) AccessManager(_admin) {
    if (_depositFee > FEE_DENOMINATOR) revert CoveredVault__FeeOutOfBound();
    if (_managementFee > FEE_DENOMINATOR) revert CoveredVault__FeeOutOfBound();

    depositFee = _depositFee;
    managementFee = _managementFee;

    emit DepositFeeUpdated(_depositFee);
    emit ManagementFeeUpdated(_managementFee);
  }

  /**
   * @dev Sets the depositFee to be applied after FEE_TIME_LOCK has passed.
   * @param _depositFee New fee percentage to charge users on deposit
   */
  function setDepositFee(uint256 _depositFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_depositFee > FEE_DENOMINATOR) revert CoveredVault__FeeOutOfBound();

    proposedDepositFee.newFee = _depositFee;
    proposedDepositFee.deadline = block.timestamp + FEE_TIME_LOCK;

    emit NewDepositFeeProposed(_depositFee);
  }

  /**
   * @dev Sets the managementFee to be applied after FEE_TIME_LOCK has passed.
   * @param _managementFee New fee percentage to charge users on invested assets
   */
  function setManagementFee(uint256 _managementFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_managementFee > FEE_DENOMINATOR) revert CoveredVault__FeeOutOfBound();

    proposedManagementFee.newFee = _managementFee;
    proposedManagementFee.deadline = block.timestamp + FEE_TIME_LOCK;

    emit NewManagementFeeProposed(_managementFee);
  }

  /**
   * @dev Sets the depositFee to its pending value if FEE_TIME_LOCK has passed.
   */
  function applyDepositFee() external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (proposedDepositFee.deadline == 0) revert CoveredVault__FeeProposalNotFound();
    if (block.timestamp < proposedDepositFee.deadline) revert CoveredVault__FeeTimeLockNotDue();

    depositFee = proposedDepositFee.newFee;
    delete proposedDepositFee;

    emit DepositFeeUpdated(depositFee);
  }

  /**
   * @dev Sets the managementFee to its pending value if FEE_TIME_LOCK has passed.
   */
  function applyManagementFee() external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (proposedManagementFee.deadline == 0) revert CoveredVault__FeeProposalNotFound();
    if (block.timestamp < proposedManagementFee.deadline) revert CoveredVault__FeeTimeLockNotDue();

    // charge fees up to now before applying the new fee
    _updateAssets();

    managementFee = proposedManagementFee.newFee;
    delete proposedManagementFee;

    emit ManagementFeeUpdated(managementFee);
  }

  /**
   * @dev Transfers accumulated fees. Only Admin can call this method
   * @param _to receiver of the claimed fees
   */
  function _claimFees(address asset, address uvAsset, address _to) internal {
    uint256 _accumulatedAssetFees = accumulatedAssetFees;
    uint256 _accumulatedUVSharesFees = accumulatedUVSharesFees;

    if (_accumulatedAssetFees == 0 && _accumulatedUVSharesFees == 0) revert CoveredVault__NoFeesToClaim();

    accumulatedAssetFees = 0;
    accumulatedUVSharesFees = 0;

    if (_accumulatedAssetFees > 0) {
      IERC20(asset).safeTransfer(_to, _accumulatedAssetFees);
    }

    if (_accumulatedUVSharesFees > 0) {
      IERC20(uvAsset).safeTransfer(_to, _accumulatedUVSharesFees);
    }
  }

  /**
   * @dev Calculates the fee to be subtracted from an amount
   * feeAmount = _amount * FeeN / FeeD
   * @param _amount total amount
   * @return the quantity of _amount to be considered as a fee
   */
  function _calculateDepositFee(uint256 _amount) internal view returns (uint256) {
    return (_amount * depositFee) / FEE_DENOMINATOR;
  }

  /**
   * @dev Calculates the total amount from an amount that already got fees subtracted
   * totalAmount = _amount + feeAmount
   * totalAmount = _amount + totalAmount * FeeN/ FeeD
   * totalAmount - totalAmount * FeeN/ FeeD = _amount
   * totalAmount * (1 - FeeN/ FeeD) = _amount
   * totalAmount = _amount / (1 - FeeN/ FeeD)
   * totalAmount = (_amount / (1 - FeeN/ FeeD)) * (FeeD / FeeD)
   * totalAmount = _amount * FeeD / (FeeD * (1 - FeeN/ FeeD))
   * totalAmount = _amount * FeeD / (FeeD - FeeN)
   * @param _amount amount
   * @return the amount from which after subtracting the fee would result in _amount
   */
  function _calculateAmountIncludingDepositFee(uint256 _amount) internal view returns (uint256) {
    return (_amount * FEE_DENOMINATOR) / (FEE_DENOMINATOR - depositFee);
  }

  /**
   * @dev Calculates the fee to be subtracted from an amount
   * feeAmount = _amount * secondsSinceLastUpdate * FeeN / FeeD / feePeriod
   * @param _amount total amount
   * @return the quantity of _amount to be considered as a fee
   */
  function _calculateManagementFee(uint256 _amount) internal view returns (uint256) {
    uint256 secondsSinceLastUpdate = block.timestamp - lastManagementFeesUpdate;
    return (_amount * secondsSinceLastUpdate * managementFee) / FEE_DENOMINATOR / FEE_MANAGER_PERIOD;
  }

  /**
   * @dev Updates the accumulated deposit fees in asset
   * @param _asset address of the asset
   * @param _amount amount of asset charges as fee
   */
  function _accrueDepositFees(address _asset, uint256 _amount) internal {
    accumulatedAssetFees += _amount;

    emit FeeAccrued(_asset, _amount);
  }

  /**
   * @dev Updates the accumulated management fees in underlying vault shares
   * @param _asset address of the asset
   * @param _amount amount of asset charges as fee
   */
  function _accrueManagementFees(address _asset, uint256 _amount) internal {
    accumulatedUVSharesFees += _amount;

    emit FeeAccrued(_asset, _amount);
  }

  /**
   * @dev Internal hook to update assets based on management fees
   */
  function _updateAssets() internal virtual;
}
