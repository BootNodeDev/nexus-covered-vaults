// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract CoverNFTMock is ERC721 {
  constructor(string memory name, string memory symbol) ERC721(name, symbol) {
    // solhint-disable-previous-line no-empty-blocks
  }

  function mint(address to, uint256 tokenId) external {
    _mint(to, tokenId);
  }
}
