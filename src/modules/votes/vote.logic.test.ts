import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canWriteComment, isUuid, parseVoteValue, pickAnonymousId, preferAccountVote, voteOutcome } from "./vote.logic.js";

describe("parseVoteValue", () => {
  it("accepts Myth/Fact values only", () => {
    assert.equal(parseVoteValue("TRUE"), "TRUE");
    assert.equal(parseVoteValue("FALSE"), "FALSE");
    assert.equal(parseVoteValue("MYTH"), null);
    assert.equal(parseVoteValue("correct"), null);
  });
});

describe("voteOutcome", () => {
  it("scores from the stored verdict, not the client", () => {
    assert.deepEqual(voteOutcome("FALSE", "FALSE"), {
      isCorrect: true,
      correctAnswer: "FALSE",
    });
    assert.deepEqual(voteOutcome("TRUE", "FALSE"), {
      isCorrect: false,
      correctAnswer: "TRUE",
    });
    assert.deepEqual(voteOutcome("PARTIALLY_TRUE", "TRUE"), {
      isCorrect: false,
      correctAnswer: null,
    });
  });
});

describe("preferAccountVote", () => {
  it("keeps the signed-in vote when both identities answered the same myth", () => {
    assert.equal(preferAccountVote("TRUE", "FALSE"), "TRUE");
    assert.equal(preferAccountVote(null, "FALSE"), "FALSE");
    assert.equal(preferAccountVote(undefined, undefined), null);
  });
});

describe("anonymous identity", () => {
  it("only accepts a UUID cookie value", () => {
    assert.equal(isUuid("3b241101-e2bb-4255-8caf-4136c566a962"), true);
    assert.equal(isUuid("not-a-uuid"), false);
    assert.equal(isUuid(""), false);
  });

  it("prefers the cookie over the request header", () => {
    const cookie = "3b241101-e2bb-4255-8caf-4136c566a962";
    const header = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    assert.equal(pickAnonymousId(cookie, header), cookie);
    assert.equal(pickAnonymousId(null, header), header);
    assert.equal(pickAnonymousId("nope", "also-nope"), null);
  });
});

describe("comments", () => {
  it("rejects anonymous writers and allows signed-in users", () => {
    assert.equal(canWriteComment(null), false);
    assert.equal(canWriteComment(undefined), false);
    assert.equal(canWriteComment("user-1"), true);
  });
});
