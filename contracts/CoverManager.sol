// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ICover, BuyCoverParams, PoolAllocationRequest } from "./interfaces/ICover.sol";
import { IPool } from "./interfaces/IPool.sol";

/**
 * @title CoverManager
 * @dev Interacts with Nexus Mutual on behalf of allowed accounts.
 * A Nexus Mutual member MUST transfer the membership to this contract to be able to access the protocol.
 */
contract CoverManager is Ownable {
  using SafeERC20 for IERC20;

  address public immutable cover;
  address public immutable yieldTokenIncident;
  address public immutable pool;

  mapping(address => bool) public allowList;

  /* ========== Events ========== */

  event Allowed(address indexed account);
  event Disallowed(address indexed account);

  /* ========== Custom Errors ========== */

  error CoverManager_NotAllowed();
  error CoverManager_AlreadyAllowed();
  error CoverManager_AlreadyDisallowed();
  error CoverManager_SendingEthFailed();
  error CoverManager_EthNotExpected();

  modifier onlyAllowed() {
    if (!allowList[msg.sender]) {
      revert CoverManager_NotAllowed();
    }
    _;
  }

  /* ========== Constructor ========== */

  /**
   * @dev Initializes the main admin role
   * @param _cover Address of the Cover contract
   * @param _yieldTokenIncident Address of the YieldTokenIncident contract
   */
  constructor(address _cover, address _yieldTokenIncident, address _pool) {
    cover = _cover;
    yieldTokenIncident = _yieldTokenIncident;
    pool = _pool;
  }

  /* ========== Admin methods ========== */

  /**
   * @dev Allows an account to call methods in this contract
   * @param _account Address to allow calling methods
   */
  function addToAllowList(address _account) external onlyOwner {
    if (allowList[_account]) {
      revert CoverManager_AlreadyAllowed();
    }

    allowList[_account] = true;
    emit Allowed(_account);
  }

  /**
   * @dev Remove permission of an account to call methods in this contract
   * @param _account Address to reject calling methods
   */
  function removeFromAllowList(address _account) external onlyOwner {
    if (!allowList[_account]) {
      revert CoverManager_AlreadyDisallowed();
    }

    allowList[_account] = false;
    emit Disallowed(_account);
  }

  /**
   * @dev Allows to call Cover.buyCover() on Nexus Mutual
   * Gets caller funds to pay for the premium and returns the remaining
   * @param params parameters to call buyCover
   * @param coverChunkRequests pool allocations for buyCover
   */
  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external payable onlyAllowed returns (uint256 coverId) {
    uint256 initialBalance;
    address asset;

    bool isETH = params.paymentAsset == 0;

    if (!isETH) {
      if (msg.value != 0) revert CoverManager_EthNotExpected();

      asset = IPool(pool).getAsset(params.paymentAsset).assetAddress;

      initialBalance = IERC20(asset).balanceOf(address(this));

      IERC20(asset).safeTransferFrom(msg.sender, address(this), params.maxPremiumInAsset);
      IERC20(asset).safeApprove(cover, params.maxPremiumInAsset);
    } else {
      initialBalance = address(this).balance - msg.value;
    }

    coverId = ICover(cover).buyCover{ value: msg.value }(params, coverChunkRequests);

    uint256 finalBalance = isETH ? address(this).balance : IERC20(asset).balanceOf(address(this));

    uint256 remaining = finalBalance - initialBalance;

    // ETH/Asset unspent is returned to buyer
    if (remaining > 0) {
      if (isETH) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(msg.sender).call{ value: remaining }("");
        if (!success) {
          revert CoverManager_SendingEthFailed();
        }
      } else {
        IERC20(asset).safeTransfer(msg.sender, remaining);
        // reset allowance to 0 to comply with tokens that implement the anti frontrunning approval fix (ie. USDT)
        IERC20(asset).safeApprove(cover, 0);
      }
    }

    return coverId;
  }

  /**
   * @dev Used to receive buyCover remaining ETH and cover payments
   */
  receive() external payable {
    // solhint-disable-previous-line no-empty-blocks
  }
}
