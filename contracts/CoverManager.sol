// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ICover, BuyCoverParams, PoolAllocationRequest } from "./interfaces/ICover.sol";
import { IPool } from "./interfaces/IPool.sol";

/**
 * @title CoverManager
 * @dev Interacts with Nexus Mutual on behalf of allowed accounts.
 * A Nexus Mutual member MUST transfer the membership to this contract to be able to access the protocol.
 */
contract CoverManager is Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  address public immutable cover;
  address public immutable yieldTokenIncident;
  address public immutable pool;

  mapping(address => bool) public allowList;
  // TODO Update solidity and use naming?
  mapping(address => mapping(address => uint256)) public funds;

  /* ========== Events ========== */

  event Allowed(address indexed account);
  event Disallowed(address indexed account);

  /* ========== Custom Errors ========== */

  error CoverManager_NotAllowed();
  error CoverManager_AlreadyAllowed();
  error CoverManager_AlreadyDisallowed();
  error CoverManager_SendingEthFailed();
  error CoverManager_InsufficientFunds();
  error CoverManager_DepositNotAllowed();

  modifier onlyAllowed() {
    if (!allowList[msg.sender]) revert CoverManager_NotAllowed();
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
    if (allowList[_account]) revert CoverManager_AlreadyAllowed();

    allowList[_account] = true;
    emit Allowed(_account);
  }

  /**
   * @dev Remove permission of an account to call methods in this contract
   * @param _account Address to reject calling methods
   */
  function removeFromAllowList(address _account) external onlyOwner {
    if (!allowList[_account]) revert CoverManager_AlreadyDisallowed();

    allowList[_account] = false;
    emit Disallowed(_account);
  }

  /**
   * @dev Allows to call Cover.buyCover() on Nexus Mutual
   * Use available funds from caller to pay for the premium
   * @param params parameters to call buyCover
   * @param coverChunkRequests pool allocations for buyCover
   */
  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external nonReentrant onlyAllowed returns (uint256 coverId) {
    address asset = IPool(pool).getAsset(params.paymentAsset).assetAddress;

    bool isETH = params.paymentAsset == 0;

    if (funds[asset][msg.sender] < params.maxPremiumInAsset) revert CoverManager_InsufficientFunds();

    if (!isETH) {
      IERC20(asset).safeApprove(cover, params.maxPremiumInAsset);
    }

    uint256 initialBalance = isETH ? address(this).balance : IERC20(asset).balanceOf(address(this));
    coverId = isETH
      ? ICover(cover).buyCover{ value: params.amount }(params, coverChunkRequests)
      : ICover(cover).buyCover(params, coverChunkRequests);
    uint256 finalBalance = isETH ? address(this).balance : IERC20(asset).balanceOf(address(this));

    if (!isETH) {
      // reset allowance to 0 to comply with tokens that implement the anti frontrunning approval fix (ie. USDT)
      IERC20(asset).safeApprove(cover, 0);
    }

    uint256 spent = initialBalance - finalBalance;

    funds[asset][msg.sender] -= spent;

    return coverId;
  }

  /**
   * @dev Allows depositing assets for paying the cover premiums
   * @param _asset asset deposited
   * @param _amount amount of asset on behalf of _to
   * @param _to address allowed to use deposited assets
   */
  function depositOnBehalf(address _asset, uint256 _amount, address _to) external nonReentrant {
    // Validate _to to avoid losing funds
    if (_to != msg.sender && allowList[_to] == false) revert CoverManager_DepositNotAllowed();

    funds[_asset][_to] += _amount;
    IERC20(_asset).safeTransferFrom(msg.sender, address(this), _amount);
  }

  /**
   * @dev Allows to deposit ETH for paying the cover premiums
   * @param _to address allowed to use deposited ETH
   */
  function depositETHOnBehalf(address _to) external payable nonReentrant {
    // Validate _to to avoid losing funds
    if (_to != msg.sender && allowList[_to] == false) revert CoverManager_DepositNotAllowed();

    funds[ETH_ADDRESS][_to] += msg.value;
  }

  /**
   * @dev Allows to withdraw deposited user' assets and ETH from funds
   * @param _asset asset address to withdraw
   * @param _amount amount to withdraw
   * @param _to address to send withdrawn funds
   */
  function withdraw(address _asset, uint256 _amount, address _to) external nonReentrant {
    funds[_asset][msg.sender] -= _amount;

    if (_asset == ETH_ADDRESS) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool success, ) = address(_to).call{ value: _amount }("");
      if (!success) revert CoverManager_SendingEthFailed();
    } else {
      IERC20(_asset).safeTransfer(_to, _amount);
    }
  }

  /**
   * @dev Used to receive buyCover remaining ETH and cover payments
   */
  receive() external payable {
    // solhint-disable-previous-line no-empty-blocks
  }
}
