(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GBMarking = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CONTRACTIONS = [
    ["\\bi'll\\b", "i will"],
    ["\\bi'd\\b", "i would"],
    ["\\bwon't\\b", "will not"],
    ["\\bdon't\\b", "do not"],
    ["\\bdoesn't\\b", "does not"],
    ["\\bisn't\\b", "is not"],
    ["\\baren't\\b", "are not"],
    ["\\bshouldn't\\b", "should not"]
  ];

  function normalizeAnswer(raw) {
    var text = String(raw == null ? "" : raw);
    text = text.replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC\uFF07]/g, "'");
    text = text.replace(/\u00A0/g, " ");
    text = text.trim().replace(/\s+/g, " ").toLowerCase();
    text = text.replace(/[.!]$/, "").trim();
    for (var i = 0; i < CONTRACTIONS.length; i += 1) {
      text = text.replace(new RegExp(CONTRACTIONS[i][0], "g"), CONTRACTIONS[i][1]);
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function matchesAccepted(raw, acceptedList) {
    var norm = normalizeAnswer(raw);
    if (!norm) {
      return false;
    }
    var list = acceptedList || [];
    for (var i = 0; i < list.length; i += 1) {
      if (normalizeAnswer(list[i]) === norm) {
        return true;
      }
    }
    return false;
  }

  function isTeacherReview(question) {
    return !!(question && (question.teacher_review || question.type === "teacher_review"));
  }

  function isAutoMarked(question) {
    return !!question && !isTeacherReview(question);
  }

  function isAutoCorrect(question, response) {
    if (!isAutoMarked(question)) {
      return false;
    }
    var answer = response || {};
    if (question.type === "mcq") {
      return answer.optionId === question.correct_option_id;
    }
    if (question.type === "gap") {
      return matchesAccepted(answer.text, question.accepted_answers);
    }
    return false;
  }

  function handInAccepted(text) {
    return String(text == null ? "" : text).trim().length > 0;
  }

  function emptyAttempt() {
    return {
      attempts: 0,
      firstResult: null,
      retryCorrect: false,
      finalized: false,
      hintShown: false,
      teacherSubmitted: false,
      pupilText: "",
      formError: ""
    };
  }

  function reduceAttempt(record, correct) {
    var rec = Object.assign(emptyAttempt(), record || {});
    if (rec.finalized) {
      return rec;
    }
    if (rec.attempts === 0) {
      rec.attempts = 1;
      rec.firstResult = correct ? "correct" : "incorrect";
      rec.finalized = !!correct;
      rec.hintShown = !correct;
      rec.retryCorrect = false;
      return rec;
    }
    rec.attempts += 1;
    rec.finalized = true;
    rec.retryCorrect = !!correct;
    return rec;
  }

  function reduceTeacherHandIn(record, text) {
    var rec = Object.assign(emptyAttempt(), record || {});
    var raw = String(text == null ? "" : text);
    if (!handInAccepted(raw)) {
      rec.formError = "empty";
      rec.teacherSubmitted = false;
      rec.finalized = false;
      rec.firstResult = null;
      rec.retryCorrect = false;
      rec.hintShown = false;
      return rec;
    }
    rec.formError = "";
    rec.teacherSubmitted = true;
    rec.pupilText = raw;
    rec.finalized = true;
    rec.firstResult = null;
    rec.retryCorrect = false;
    rec.hintShown = false;
    return rec;
  }

  return {
    normalizeAnswer: normalizeAnswer,
    matchesAccepted: matchesAccepted,
    isTeacherReview: isTeacherReview,
    isAutoMarked: isAutoMarked,
    isAutoCorrect: isAutoCorrect,
    handInAccepted: handInAccepted,
    emptyAttempt: emptyAttempt,
    reduceAttempt: reduceAttempt,
    reduceTeacherHandIn: reduceTeacherHandIn
  };
});
