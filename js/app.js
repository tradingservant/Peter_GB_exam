(function () {
  "use strict";

  var marking = window.GBMarking;
  var state = {
    pack: null,
    stationIndex: 0,
    records: Object.create(null),
    progress: Object.create(null)
  };

  var main = document.getElementById("main");
  var menu = document.getElementById("station-menu");
  var scoreboard = document.getElementById("scoreboard");
  var resetButton = document.getElementById("reset-button");

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    var props = attrs || {};
    Object.keys(props).forEach(function (key) {
      var value = props[key];
      if (value == null || value === false) {
        return;
      }
      if (key === "class") {
        node.className = value;
      } else if (key === "text") {
        node.textContent = value;
      } else if (key === "hidden") {
        node.hidden = true;
      } else {
        node.setAttribute(key, value === true ? "" : String(value));
      }
    });
    (children || []).forEach(function (child) {
      if (child) {
        node.appendChild(child);
      }
    });
    return node;
  }

  function station() {
    return state.pack.stations[state.stationIndex];
  }

  function screensOf(item) {
    return item.teaching_screens || [];
  }

  function ensureProgress(item) {
    if (!state.progress[item.id]) {
      var screens = screensOf(item);
      state.progress[item.id] = {
        phase: screens.length ? "teaching" : "intro",
        teachingIndex: 0,
        questionIndex: 0,
        teachingComplete: screens.length === 0,
        resumePhase: ""
      };
    }
    return state.progress[item.id];
  }

  function recordFor(id) {
    if (!state.records[id]) {
      state.records[id] = marking.emptyAttempt();
    }
    return state.records[id];
  }

  function allQuestions() {
    var list = [];
    state.pack.stations.forEach(function (item) {
      item.questions.forEach(function (question) {
        list.push(question);
      });
    });
    return list;
  }

  function tally() {
    var firstCorrect = 0;
    var retryCorrect = 0;
    var teacherPending = 0;
    var autoTotal = 0;
    var teacherTotal = 0;
    allQuestions().forEach(function (question) {
      var rec = state.records[question.id];
      if (marking.isTeacherReview(question)) {
        teacherTotal += 1;
        if (rec && rec.teacherSubmitted) {
          teacherPending += 1;
        }
        return;
      }
      autoTotal += 1;
      if (rec && rec.firstResult === "correct") {
        firstCorrect += 1;
      }
      if (rec && rec.retryCorrect) {
        retryCorrect += 1;
      }
    });
    return {
      firstCorrect: firstCorrect,
      retryCorrect: retryCorrect,
      teacherPending: teacherPending,
      autoTotal: autoTotal,
      teacherTotal: teacherTotal,
      questionTotal: autoTotal + teacherTotal
    };
  }

  function renderScore() {
    var totals = tally();
    scoreboard.textContent = "首次答對：" + totals.firstCorrect + "／" + totals.autoTotal +
      "。提示後答對（不計入首次答對）：" + totals.retryCorrect +
      "。待教師審閱：" + totals.teacherPending + "／" + totals.teacherTotal + "。";
    scoreboard.setAttribute("data-first-correct", String(totals.firstCorrect));
    scoreboard.setAttribute("data-retry-correct", String(totals.retryCorrect));
    scoreboard.setAttribute("data-teacher-pending", String(totals.teacherPending));
    scoreboard.setAttribute("data-auto-total", String(totals.autoTotal));
    scoreboard.setAttribute("data-teacher-total", String(totals.teacherTotal));
    scoreboard.setAttribute("data-question-total", String(totals.questionTotal));
  }

  function renderMenu() {
    menu.textContent = "";
    state.pack.stations.forEach(function (item, index) {
      var done = 0;
      item.questions.forEach(function (question) {
        var rec = state.records[question.id];
        if (!rec) {
          return;
        }
        if (marking.isTeacherReview(question)) {
          if (rec.teacherSubmitted) {
            done += 1;
          }
        } else if (rec.finalized) {
          done += 1;
        }
      });
      var button = el("button", {
        type: "button",
        text: item.title_zh + "（" + done + "／" + item.questions.length + "）",
        "data-station-id": item.id,
        "data-question-count": String(item.questions.length),
        "aria-current": index === state.stationIndex ? "page" : false
      });
      button.addEventListener("click", function () {
        openStation(index);
      });
      menu.appendChild(button);
    });
  }

  function focusMain() {
    main.focus();
  }

  function render() {
    renderMenu();
    renderScore();
    var item = station();
    var progress = ensureProgress(item);
    main.textContent = "";
    main.setAttribute("data-phase", progress.phase);
    main.setAttribute("data-station-id", item.id);
    if (progress.phase === "teaching") {
      renderTeaching(item, progress);
    } else if (progress.phase === "intro") {
      renderIntro(item, progress);
    } else if (progress.phase === "done") {
      renderDone(item, progress);
    } else {
      renderQuestion(item, progress);
    }
  }

  function renderTeaching(item, progress) {
    var screens = screensOf(item);
    var screen = screens[progress.teachingIndex];
    var article = el("article", {
      class: "panel",
      "data-screen-id": screen.id,
      "data-screen-index": String(progress.teachingIndex + 1),
      "data-screen-total": String(screens.length)
    });
    article.appendChild(el("p", { class: "direction", text: "教學說明　第 " + (progress.teachingIndex + 1) + " 頁，共 " + screens.length + " 頁" }));
    article.appendChild(el("h2", { class: "screen-title", "data-field": "title_zh", text: screen.title_zh }));
    if (screen.title_en) {
      article.appendChild(el("p", { class: "screen-en", lang: "en", "data-field": "title_en", text: screen.title_en }));
    }
    article.appendChild(el("p", { "data-field": "body_zh", text: screen.body_zh }));
    if (screen.body_en) {
      article.appendChild(el("p", { class: "screen-en", lang: "en", "data-field": "body_en", text: screen.body_en }));
    }
    (screen.examples || []).forEach(function (example, index) {
      var block = el("div", { class: "example", "data-example-index": String(index) });
      block.appendChild(el("p", { class: "example-label", text: "例子" }));
      block.appendChild(el("p", { class: "example-en", lang: "en", "data-field": "en", text: example.en }));
      if (example.en_alt) {
        block.appendChild(el("p", { class: "example-label", text: "另一種寫法" }));
        block.appendChild(el("p", { class: "example-en", lang: "en", "data-field": "en_alt", text: example.en_alt }));
      }
      if (example.note_zh) {
        block.appendChild(el("p", { "data-field": "note_zh", text: example.note_zh }));
      }
      article.appendChild(block);
    });
    var row = el("div", { class: "button-row" });
    if (progress.teachingIndex > 0) {
      row.appendChild(buttonEl("上一頁", function () {
        progress.teachingIndex -= 1;
        render();
        focusMain();
      }));
    }
    row.appendChild(buttonEl("下一頁", function () {
      advanceTeaching(item, progress);
    }, "primary"));
    if (progress.teachingComplete && progress.resumePhase === "question") {
      row.appendChild(buttonEl("返回題目", function () {
        progress.phase = "question";
        render();
        focusMain();
      }));
    }
    if (progress.teachingComplete && progress.resumePhase === "intro") {
      row.appendChild(buttonEl("返回說明", function () {
        progress.phase = "intro";
        render();
        focusMain();
      }));
    }
    article.appendChild(row);
    main.appendChild(article);
  }

  function advanceTeaching(item, progress) {
    var screens = screensOf(item);
    if (progress.teachingIndex < screens.length - 1) {
      progress.teachingIndex += 1;
      render();
      focusMain();
      return;
    }
    progress.teachingComplete = true;
    if (progress.resumePhase === "question" || progress.resumePhase === "intro" || progress.resumePhase === "done") {
      progress.phase = progress.resumePhase;
    } else {
      progress.phase = "intro";
    }
    render();
    focusMain();
  }

  function renderIntro(item, progress) {
    var article = el("article", { class: "panel", "data-screen": "intro" });
    article.appendChild(el("h2", { text: item.title_zh }));
    article.appendChild(el("p", { class: "screen-en", lang: "en", text: item.title }));
    article.appendChild(el("p", { "data-field": "intro_zh", text: item.intro_zh }));
    article.appendChild(el("p", { class: "intro-en", lang: "en", "data-field": "intro_en", text: item.intro_en }));
    article.appendChild(el("p", { text: "請先自行作答。第一次提交前不會顯示提示。首次答對與提示後答對會分開記錄。" }));
    var row = el("div", { class: "button-row" });
    row.appendChild(buttonEl("開始作答", function () {
      progress.phase = "question";
      progress.questionIndex = 0;
      render();
      focusMain();
    }, "primary"));
    if (screensOf(item).length) {
      row.appendChild(buttonEl("返回教學說明", function () {
        progress.resumePhase = "intro";
        progress.phase = "teaching";
        progress.teachingIndex = 0;
        render();
        focusMain();
      }));
    }
    article.appendChild(row);
    main.appendChild(article);
  }

  function renderDone(item, progress) {
    var article = el("article", { class: "panel", "data-screen": "done" });
    article.appendChild(el("h2", { text: item.title_zh }));
    article.appendChild(el("p", { text: "本關題目已可檢視。成績只暫存在本頁記憶體。" }));
    var row = el("div", { class: "button-row" });
    row.appendChild(buttonEl("檢視題目", function () {
      progress.phase = "question";
      progress.questionIndex = 0;
      render();
      focusMain();
    }));
    if (screensOf(item).length) {
      row.appendChild(buttonEl("返回教學說明", function () {
        progress.resumePhase = "done";
        progress.phase = "teaching";
        progress.teachingIndex = 0;
        render();
        focusMain();
      }));
    }
    if (state.stationIndex < state.pack.stations.length - 1) {
      row.appendChild(buttonEl("下一關", function () {
        openStation(state.stationIndex + 1);
      }, "primary"));
    } else {
      article.appendChild(el("p", { text: "五關練習到此結束。請教師查看待審閱的短寫。重新載入頁面後，紀錄會清除。" }));
    }
    article.appendChild(row);
    main.appendChild(article);
  }

  function renderQuestion(item, progress) {
    var question = item.questions[progress.questionIndex];
    var rec = recordFor(question.id);
    var article = el("article", {
      class: "panel",
      "data-question-id": question.id,
      "data-type": question.type,
      "data-auto-marked": marking.isAutoMarked(question) ? "true" : "false",
      "data-finalized": rec.finalized ? "true" : "false",
      "data-hint-visible": rec.hintShown && !rec.finalized ? "true" : "false",
      "data-first-result": rec.firstResult || "",
      "data-retry-correct": rec.retryCorrect ? "true" : "false",
      "data-teacher-submitted": rec.teacherSubmitted ? "true" : "false",
      "data-mastery": "false",
      "data-progress-index": String(progress.questionIndex + 1),
      "data-progress-total": String(item.questions.length)
    });
    article.appendChild(el("p", {
      class: "direction",
      text: "進度：第 " + (progress.questionIndex + 1) + " 題，共 " + item.questions.length + " 題"
    }));
    article.appendChild(el("p", { class: "direction", "data-field": "prompt_zh", text: question.prompt_zh }));
    article.appendChild(el("h2", { class: "stem", lang: "en", "data-field": "prompt", text: question.prompt }));

    if (marking.isTeacherReview(question)) {
      article.appendChild(el("p", { text: "題目建議寫兩至三句，此處只作指引。只要寫有內容，即可提交，由教師審閱。此題不設自動評分，亦不當作已經掌握。" }));
    } else if (!rec.attempts) {
      article.appendChild(el("p", { text: "請先自行作答。第一次提交前不會顯示提示。" }));
    } else if (rec.hintShown && !rec.finalized) {
      article.appendChild(el("p", { text: "請再試一次。今次答對不會計入首次答對。" }));
    }

    if (rec.formError === "empty") {
      var emptyText = marking.isTeacherReview(question) ? "請先寫下內容，然後按提交。" : (question.type === "mcq" ? "請先選擇一個選項。" : "請先填寫答案。");
      article.appendChild(el("p", { class: "form-error", "data-field": "form-error", text: emptyText }));
    }

    if (rec.hintShown && !rec.finalized && question.hints && question.hints.first_error) {
      var hint = el("div", { class: "hint" });
      hint.appendChild(el("p", { class: "example-label", text: "提示" }));
      hint.appendChild(el("p", { "data-field": "hint", text: question.hints.first_error }));
      article.appendChild(hint);
    }

    if (rec.finalized && !marking.isTeacherReview(question)) {
      if (rec.firstResult === "correct") {
        article.appendChild(el("p", { class: "status-line status-ok", "data-field": "status-first", text: "首次答對。" }));
      } else {
        article.appendChild(el("p", { class: "status-line status-no", "data-field": "status-first", text: "首次作答未答對，結果已固定。" }));
        if (rec.retryCorrect) {
          article.appendChild(el("p", { class: "status-line status-ok", "data-field": "status-retry", text: "提示後答對（不計入首次答對）。" }));
        } else {
          article.appendChild(el("p", { class: "status-line status-no", "data-field": "status-retry", text: "再次作答仍未答對。" }));
        }
      }
      if (rec.firstResult === "correct" || rec.retryCorrect) {
        article.appendChild(el("p", { class: "feedback", "data-field": "feedback-correct", text: question.feedback.correct }));
      }
      article.appendChild(el("p", { class: "feedback", "data-field": "feedback-explanatory", text: question.feedback.explanatory }));
    }

    if (marking.isTeacherReview(question) && rec.teacherSubmitted) {
      article.appendChild(el("p", { class: "example-label", text: "你所提交的文字" }));
      article.appendChild(el("blockquote", { class: "pupil-text", "data-field": "pupil-text", text: rec.pupilText }));
      article.appendChild(el("p", { class: "status-line status-wait", "data-field": "teacher-status", text: question.feedback.correct }));
      article.appendChild(el("p", { text: "此題不設自動評分，亦不計入首次答對。" }));
    }

    if (!rec.finalized) {
      article.appendChild(buildForm(question, rec));
    } else if (question.type === "mcq") {
      article.appendChild(buildChoices(question, rec, true));
    } else if (question.type === "gap") {
      var frozen = el("input", {
        class: "gap-input",
        id: "gap-answer",
        type: "text",
        readonly: "readonly",
        value: rec.lastText || ""
      });
      article.appendChild(el("label", { for: "gap-answer", text: "你的答案" }));
      article.appendChild(frozen);
    }

    article.appendChild(buildJump(item, progress));
    var row = el("div", { class: "button-row" });
    if (progress.questionIndex > 0) {
      row.appendChild(buttonEl("上一題", function () {
        progress.questionIndex -= 1;
        render();
        focusMain();
      }));
    }
    if (rec.finalized && progress.questionIndex < item.questions.length - 1) {
      row.appendChild(buttonEl("下一題", function () {
        progress.questionIndex += 1;
        render();
        focusMain();
      }, "primary"));
    }
    if (rec.finalized && progress.questionIndex === item.questions.length - 1) {
      row.appendChild(buttonEl("完成本關", function () {
        progress.phase = "done";
        render();
        focusMain();
      }, "primary"));
    }
    if (screensOf(item).length) {
      row.appendChild(buttonEl("返回教學說明", function () {
        progress.resumePhase = "question";
        progress.phase = "teaching";
        progress.teachingIndex = 0;
        render();
        focusMain();
      }));
    }
    article.appendChild(row);
    main.appendChild(article);
  }

  function buildJump(item, progress) {
    var nav = el("div", { class: "jump-list", "aria-label": "本關題目" });
    item.questions.forEach(function (question, index) {
      var button = buttonEl("第" + (index + 1) + "題", function () {
        progress.questionIndex = index;
        render();
        focusMain();
      });
      button.setAttribute("data-question-jump", question.id);
      if (index === progress.questionIndex) {
        button.setAttribute("aria-current", "page");
      }
      nav.appendChild(button);
    });
    return nav;
  }

  function buildForm(question, rec) {
    var form = el("form", { novalidate: "novalidate" });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      onSubmit(question, form);
    });
    if (question.type === "mcq") {
      form.appendChild(buildChoices(question, rec, false));
    } else if (question.type === "gap") {
      form.appendChild(el("label", { for: "gap-answer", text: "你的答案" }));
      var input = el("input", {
        class: "gap-input",
        id: "gap-answer",
        name: "answer",
        type: "text",
        autocomplete: "off",
        "aria-label": "你的答案"
      });
      input.value = rec.lastText || "";
      form.appendChild(input);
    } else {
      form.appendChild(el("label", { for: "writing-answer", text: "你的短文" }));
      var area = el("textarea", {
        class: "writing-input",
        id: "writing-answer",
        name: "writing",
        "aria-label": "你的短文"
      });
      area.value = rec.pupilText || "";
      form.appendChild(area);
    }
    form.appendChild(buttonEl("提交", null, "primary"));
    var submit = form.querySelector("button");
    submit.type = "submit";
    return form;
  }

  function buildChoices(question, rec, locked) {
    var field = el("fieldset");
    field.appendChild(el("legend", { class: "visually-hidden", text: "請選擇答案" }));
    question.options.forEach(function (option) {
      var label = el("label", { class: "option" });
      var radio = el("input", { type: "radio", name: "choice", value: option.id });
      if (locked) {
        radio.disabled = true;
      }
      if (rec.selectedOptionId === option.id) {
        radio.checked = true;
      }
      label.appendChild(radio);
      label.appendChild(el("span", { class: "option-id", "data-field": "option-id", text: option.id }));
      label.appendChild(el("span", { class: "option-text", lang: "en", "data-field": "option-text", text: option.text }));
      if (locked && option.id === question.correct_option_id) {
        label.classList.add("is-key");
        label.appendChild(el("span", { class: "option-note", text: "（正確選項）" }));
      }
      field.appendChild(label);
    });
    return field;
  }

  function onSubmit(question, form) {
    var rec = recordFor(question.id);
    rec.formError = "";
    if (marking.isTeacherReview(question)) {
      var writing = form.querySelector("#writing-answer").value;
      var next = marking.reduceTeacherHandIn(rec, writing);
      state.records[question.id] = next;
      if (next.formError === "empty") {
        next.pupilText = writing;
      }
      render();
      focusMain();
      return;
    }
    if (question.type === "mcq") {
      var selected = form.querySelector("input[name='choice']:checked");
      if (!selected) {
        rec.formError = "empty";
        render();
        focusMain();
        return;
      }
      rec.selectedOptionId = selected.value;
      var correct = marking.isAutoCorrect(question, { optionId: selected.value });
      state.records[question.id] = marking.reduceAttempt(rec, correct);
      render();
      focusMain();
      return;
    }
    var field = form.querySelector("#gap-answer");
    var text = field ? field.value : "";
    if (!String(text).trim()) {
      rec.formError = "empty";
      rec.lastText = text;
      render();
      focusMain();
      return;
    }
    rec.lastText = text;
    var gapCorrect = marking.isAutoCorrect(question, { text: text });
    var updated = marking.reduceAttempt(rec, gapCorrect);
    updated.lastText = text;
    updated.selectedOptionId = rec.selectedOptionId;
    state.records[question.id] = updated;
    render();
    focusMain();
  }

  function buttonEl(label, onClick, kind) {
    var button = el("button", { type: "button", class: kind || "", text: label });
    if (onClick) {
      button.addEventListener("click", onClick);
    }
    return button;
  }

  function openStation(index) {
    state.stationIndex = index;
    ensureProgress(station());
    render();
    focusMain();
  }

  function resetAll() {
    state.records = Object.create(null);
    state.progress = Object.create(null);
    state.stationIndex = 0;
    openStation(0);
  }

  function showLoadError() {
    main.textContent = "";
    main.setAttribute("data-phase", "error");
    main.appendChild(el("p", { class: "form-error", text: "未能載入練習內容。請透過網站伺服器開啟本頁。" }));
  }

  resetButton.addEventListener("click", resetAll);

  fetch("data/exercises.json", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("load failed");
      }
      return response.json();
    })
    .then(function (pack) {
      state.pack = pack;
      var title = document.getElementById("page-title");
      if (pack.meta && pack.meta.title_zh) {
        title.textContent = pack.meta.title_zh;
        document.title = pack.meta.title_zh;
      }
      openStation(0);
    })
    .catch(function () {
      showLoadError();
    });
})();
