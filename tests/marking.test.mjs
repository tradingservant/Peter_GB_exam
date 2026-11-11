import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const marking = require(path.join(root, "js/marking.js"));
const pack = JSON.parse(fs.readFileSync(path.join(root, "data/exercises.json"), "utf8"));

function question(id) {
  for (const station of pack.stations) {
    for (const item of station.questions) {
      if (item.id === id) {
        return item;
      }
    }
  }
  throw new Error("missing " + id);
}

test("normalises case, spaces, one final stop, apostrophes and listed contractions", () => {
  const pairs = [
    ["I'll stay", "I will stay"],
    ["I\u2019ll stay", "I will stay"],
    ["I'LL stay", "i will stay"],
    ["I'd go", "I would go"],
    ["I’d go", "I would go"],
    ["won't go", "will not go"],
    ["Won't go", "will not go"],
    ["don't go", "do not go"],
    ["don’t go", "do not go"],
    ["doesn't like", "does not like"],
    ["doesn’t like", "does not like"],
    ["isn't open", "is not open"],
    ["isn’t open", "is not open"],
    ["aren't ready", "are not ready"],
    ["aren’t ready", "are not ready"],
    ["shouldn't go", "should not go"],
    ["shouldn’t go", "should not go"]
  ];
  pairs.forEach(([left, right]) => {
    assert.equal(marking.normalizeAnswer(left), marking.normalizeAnswer(right), left + " vs " + right);
  });
  assert.equal(marking.normalizeAnswer("  I   would    fly. "), "i would fly");
  assert.equal(marking.normalizeAnswer("I would fly!"), "i would fly");
  assert.equal(marking.normalizeAnswer("were."), "were");
  assert.equal(marking.normalizeAnswer("were!"), "were");
  assert.notEqual(marking.normalizeAnswer("were?"), "were");
  assert.notEqual(marking.normalizeAnswer("were!!"), "were");
  assert.notEqual(marking.normalizeAnswer("were,"), "were");
  assert.equal(marking.normalizeAnswer("we'll cancel"), "we'll cancel");
  assert.notEqual(marking.normalizeAnswer("we'll cancel"), marking.normalizeAnswer("we will cancel"));
  assert.notEqual(marking.normalizeAnswer("was"), marking.normalizeAnswer("were"));
  assert.notEqual(marking.normalizeAnswer("will"), marking.normalizeAnswer("would"));
  assert.notEqual(marking.normalizeAnswer("had"), marking.normalizeAnswer("have"));
  assert.notEqual(marking.normalizeAnswer("either too"), marking.normalizeAnswer("either"));
  assert.notEqual(marking.normalizeAnswer("tasty"), marking.normalizeAnswer("tastes"));
  assert.notEqual(marking.normalizeAnswer("taste"), marking.normalizeAnswer("tastes"));
  assert.notEqual(marking.normalizeAnswer("tasted"), marking.normalizeAnswer("tastes"));
});

test("listed contractions match when only one form is accepted", () => {
  const cases = [
    [["I will stay"], "I'll stay."],
    [["I'll stay"], "I will stay"],
    [["I would go"], "I'd go!"],
    [["I'd go"], "I would go"],
    [["will not go"], "won't go"],
    [["won't go"], "will not go"],
    [["do not go"], "don't go"],
    [["don't go"], "do not go"],
    [["does not like"], "doesn't like"],
    [["doesn't like"], "does not like"],
    [["is not open"], "isn't open"],
    [["isn't open"], "is not open"],
    [["are not ready"], "aren't ready"],
    [["aren't ready"], "are not ready"],
    [["should not go"], "shouldn't go"],
    [["shouldn't go"], "should not go"]
  ];
  cases.forEach(([accepted, raw]) => {
    assert.equal(marking.matchesAccepted(raw, accepted), true, raw);
  });
  assert.equal(marking.matchesAccepted("we will cancel", ["will cancel", "we'll cancel"]), false);
  assert.equal(marking.matchesAccepted("wont go", ["won't go"]), false);
});

test("rejects was/will/had/either too/tasty and accepts only listed answers", () => {
  const were = question("S2-Q05");
  assert.equal(marking.isAutoCorrect(were, { text: "was" }), false);
  assert.equal(marking.isAutoCorrect(were, { text: "Was." }), false);
  assert.equal(marking.isAutoCorrect(were, { text: "were" }), true);
  assert.equal(marking.isAutoCorrect(were, { text: "  WERE! " }), true);
  assert.equal(marking.isAutoCorrect(were, { text: "was were" }), false);

  const fly = question("S2-Q02");
  assert.equal(marking.isAutoCorrect(fly, { text: "will fly" }), false);
  assert.equal(marking.isAutoCorrect(fly, { text: "would" }), false);
  assert.equal(marking.isAutoCorrect(fly, { text: "would fly" }), true);
  assert.equal(marking.isAutoCorrect(fly, { text: "I'd fly" }), true);
  assert.equal(marking.isAutoCorrect(fly, { text: "I would fly" }), true);
  assert.equal(marking.isAutoCorrect(fly, { text: "  i'd   fly. " }), true);

  const go = question("S2-Q06");
  assert.equal(marking.isAutoCorrect(go, { text: "will go" }), false);
  assert.equal(marking.isAutoCorrect(go, { text: "I'd go" }), true);
  assert.equal(marking.isAutoCorrect(go, { text: "I WOULD GO!" }), true);

  const have = question("S3-Q04");
  assert.equal(marking.isAutoCorrect(have, { text: "had" }), false);
  assert.equal(marking.isAutoCorrect(have, { text: "has" }), false);
  assert.equal(marking.isAutoCorrect(have, { text: "have" }), true);
  assert.equal(marking.isAutoCorrect(have, { text: "Have." }), true);

  const cancel = question("S3-Q03");
  assert.equal(marking.isAutoCorrect(cancel, { text: "we'll cancel" }), true);
  assert.equal(marking.isAutoCorrect(cancel, { text: "We'll cancel." }), true);
  assert.equal(marking.isAutoCorrect(cancel, { text: "will cancel" }), true);
  assert.equal(marking.isAutoCorrect(cancel, { text: "we will cancel" }), false);
  assert.equal(marking.isAutoCorrect(cancel, { text: "would cancel" }), false);

  const imperative = question("S3-Q06");
  assert.equal(marking.isAutoCorrect(imperative, { text: "don't go" }), true);
  assert.equal(marking.isAutoCorrect(imperative, { text: "do not go" }), true);
  assert.equal(marking.isAutoCorrect(imperative, { text: "don’t go" }), true);
  assert.equal(marking.isAutoCorrect(imperative, { text: "Don't go!" }), true);
  assert.equal(marking.isAutoCorrect(imperative, { text: "shouldn't go" }), false);
  assert.equal(marking.isAutoCorrect(imperative, { text: "should not go" }), false);
  assert.equal(marking.isAutoCorrect(imperative, { text: "won't go" }), false);
  assert.equal(marking.isAutoCorrect(imperative, { text: "not go" }), false);

  ["S4-Q03", "S5-Q05"].forEach((id) => {
    const item = question(id);
    assert.equal(marking.isAutoCorrect(item, { text: "either too" }), false);
    assert.equal(marking.isAutoCorrect(item, { text: "too" }), false);
    assert.equal(marking.isAutoCorrect(item, { text: "either" }), true);
    assert.equal(marking.isAutoCorrect(item, { text: "Either!" }), true);
  });

  const tastes = question("S5-Q04");
  ["tasty", "taste", "tasted", "will taste", "tast"].forEach((bad) => {
    assert.equal(marking.isAutoCorrect(tastes, { text: bad }), false, bad);
  });
  assert.equal(marking.isAutoCorrect(tastes, { text: "tastes" }), true);
  assert.equal(marking.isAutoCorrect(tastes, { text: "Tastes." }), true);

  const mcq = question("S1-Q01");
  assert.equal(marking.isAutoCorrect(mcq, { optionId: "A" }), true);
  assert.equal(marking.isAutoCorrect(mcq, { optionId: "B", text: "Zero conditional" }), false);
  assert.equal(marking.isAutoCorrect(mcq, { text: "Zero conditional" }), false);
});

test("every listed answer matches and nearby spellings do not", () => {
  const questions = pack.stations.flatMap((station) => station.questions);
  let auto = 0;
  questions.forEach((item) => {
    if (marking.isTeacherReview(item)) {
      assert.equal(marking.isAutoCorrect(item, { text: item.accept_notes || "If I were a pilot, I would fly." }), false);
      return;
    }
    auto += 1;
    if (item.type === "mcq") {
      item.options.forEach((option) => {
        const result = marking.isAutoCorrect(item, { optionId: option.id, text: option.text });
        assert.equal(result, option.id === item.correct_option_id, item.id + " " + option.id);
      });
      return;
    }
    item.accepted_answers.forEach((answer) => {
      assert.equal(marking.isAutoCorrect(item, { text: answer }), true, item.id + " " + answer);
      assert.equal(marking.isAutoCorrect(item, { text: "  " + answer.toUpperCase() + "!  " }), true, item.id + " " + answer);
      assert.equal(marking.isAutoCorrect(item, { text: answer + "x" }), false, item.id + " extra");
    });
    assert.equal(marking.isAutoCorrect(item, { text: "" }), false);
    assert.equal(marking.isAutoCorrect(item, { text: "   " }), false);
  });
  assert.equal(auto, 35);
});

test("first result stays frozen and a hinted retry is not first-correct", () => {
  let record = marking.emptyAttempt();
  record = marking.reduceAttempt(record, false);
  assert.equal(record.firstResult, "incorrect");
  assert.equal(record.hintShown, true);
  assert.equal(record.finalized, false);
  assert.equal(record.retryCorrect, false);
  record = marking.reduceAttempt(record, true);
  assert.equal(record.firstResult, "incorrect");
  assert.equal(record.retryCorrect, true);
  assert.equal(record.finalized, true);
  const again = marking.reduceAttempt(record, false);
  assert.equal(again.firstResult, "incorrect");
  assert.equal(again.retryCorrect, true);

  let correct = marking.reduceAttempt(marking.emptyAttempt(), true);
  assert.equal(correct.firstResult, "correct");
  assert.equal(correct.hintShown, false);
  assert.equal(correct.retryCorrect, false);
  assert.equal(correct.finalized, true);
  correct = marking.reduceAttempt(correct, false);
  assert.equal(correct.firstResult, "correct");
  assert.equal(correct.retryCorrect, false);

  let missed = marking.reduceAttempt(marking.emptyAttempt(), false);
  missed = marking.reduceAttempt(missed, false);
  assert.equal(missed.firstResult, "incorrect");
  assert.equal(missed.retryCorrect, false);
  assert.equal(missed.finalized, true);
});

test("teacher review accepts any non-empty writing and does not count sentences or mastery", () => {
  const samples = [
    "Mr.",
    "Mr Brown",
    "Mr. Brown.",
    "Mr Brown met Mr. Lee.",
    "Mr. Brown will help. If it rains, I will stay in. If I were Mr. Brown, I would help.",
    "One.",
    "a",
    "If it rains, I will read. If I were a bird, I would fly. I like Maths. I like colour. Extra. More."
  ];
  samples.forEach((text) => {
    assert.equal(marking.handInAccepted(text), true, text);
    const record = marking.reduceTeacherHandIn(marking.emptyAttempt(), text);
    assert.equal(record.teacherSubmitted, true, text);
    assert.equal(record.pupilText, text);
    assert.equal(record.firstResult, null);
    assert.equal(record.retryCorrect, false);
    assert.equal(record.hintShown, false);
  });
  ["", "   ", "\n\t  "].forEach((text) => {
    assert.equal(marking.handInAccepted(text), false);
    const record = marking.reduceTeacherHandIn(marking.emptyAttempt(), text);
    assert.equal(record.teacherSubmitted, false);
    assert.equal(record.finalized, false);
    assert.equal(record.firstResult, null);
  });
  assert.equal(marking.isAutoCorrect(question("S5-Q07"), { text: "Mr. Brown. If it is fine, I will play." }), false);
  const source = fs.readFileSync(path.join(root, "js/marking.js"), "utf8");
  assert.doesNotMatch(source, /split\s*\(|match\s*\(\s*\/\\?\./);
});
