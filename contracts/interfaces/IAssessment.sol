// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

struct Poll {
  uint96 accepted;
  uint96 denied;
  uint32 start;
  uint32 end;
}

// Used for integration tests only
interface IAssessment {
  function getAssessmentsCount() external view returns (uint);

  function castVotes(
    uint[] calldata assessmentIds,
    bool[] calldata votes,
    string[] calldata ipfsAssessmentDataHashes,
    uint96 stakeIncrease
  ) external;

  function config()
    external
    view
    returns (
      uint8 minVotingPeriodInDays,
      uint8 stakeLockupPeriodInDays,
      uint8 payoutCooldownInDays,
      uint8 silentEndingPeriodInDays
    );

  function getPoll(uint assessmentId) external view returns (Poll memory);
}
