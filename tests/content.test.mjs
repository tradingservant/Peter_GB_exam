import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pack = JSON.parse(fs.readFileSync(path.join(root, "data/exercises.json"), "utf8"));

function question(id) {
  for (const station of pack.stations) {
    for (const item of station.questions) {
      if (item.id === id) {
        return item;
      }
    }
  }
  return null;
}

test("pack has five stations and 36 items in an 8/7/7/7/7 split", () => {
  assert.equal(pack.stations.length, 5);
  assert.equal(pack.meta.station_count, 5);
  assert.equal(pack.meta.question_count_core, 36);
  assert.equal(pack.meta.auto_marked_count, 35);
  assert.equal(pack.meta.teacher_review_count, 1);
  const counts = pack.stations.map((station) => station.questions.length);
  assert.deepEqual(counts, [8, 7, 7, 7, 7]);
  pack.stations.forEach((station) => {
    assert.equal(station.question_count, station.questions.length);
  });
  const ids = pack.stations.flatMap((station) => station.questions.map((item) => item.id));
  assert.equal(new Set(ids).size, 36);
  assert.equal(ids.length, 36);
});

test("35 items are auto-marked and only S5-Q07 is teacher review", () => {
  const questions = pack.stations.flatMap((station) => station.questions);
  const teacher = questions.filter((item) => item.teacher_review || item.type === "teacher_review");
  const auto = questions.filter((item) => !(item.teacher_review || item.type === "teacher_review"));
  assert.equal(teacher.length, 1);
  assert.equal(teacher[0].id, "S5-Q07");
  assert.equal(teacher[0].type, "teacher_review");
  assert.deepEqual(teacher[0].accepted_answers, []);
  assert.equal(auto.length, 35);
  auto.forEach((item) => {
    assert.notEqual(item.type, "teacher_review");
    assert.equal(item.teacher_review, false);
    assert.ok(item.hints && item.hints.first_error);
    assert.ok(item.feedback && item.feedback.explanatory);
    assert.ok(item.feedback.correct);
  });
});

test("teaching and recap screens are in the required order", () => {
  const byId = Object.fromEntries(pack.stations.map((station) => [station.id, station]));
  assert.equal(byId.S1.teaching_required_before_questions, true);
  assert.deepEqual(byId.S1.teaching_screens.map((screen) => screen.id), ["S1-T1", "S1-T2", "S1-T3", "S1-T4"]);
  assert.deepEqual(byId.S2.teaching_screens.map((screen) => screen.id), ["S2-T1"]);
  assert.deepEqual(byId.S3.teaching_screens.map((screen) => screen.id), ["S3-T1"]);
  assert.deepEqual(byId.S4.teaching_screens.map((screen) => screen.id), ["S4-T1"]);
  assert.deepEqual(byId.S5.teaching_screens, []);
  assert.equal(byId.S5.teaching_required_before_questions, false);
  for (const station of pack.stations) {
    for (const screen of station.teaching_screens) {
      assert.ok(screen.title_zh);
      assert.ok(screen.body_zh);
      assert.ok(screen.body_en);
      assert.ok(screen.examples && screen.examples.length > 0);
      screen.examples.forEach((example) => {
        assert.ok(example.en);
      });
    }
    station.questions.forEach((item, index) => {
      const expected = station.id + "-Q" + String(index + 1).padStart(2, "0");
      assert.equal(item.id, expected);
      assert.ok(item.prompt);
      assert.ok(item.prompt_zh);
    });
  }
});

test("corrected feedback option letters match the delivered pack", () => {
  const expected = {
    "S1-Q04": {
      correct_option_id: "C",
      explanatory: "Zero conditionals use the present tense in both clauses: If you freeze water, it becomes ice. A is a second conditional (past + would). D points to one future time, not a general fact. B mixes a past if-clause with a present main clause."
    },
    "S1-Q05": {
      correct_option_id: "B",
      explanatory: "This is a first conditional: Saturday may be sunny, and the result will probably happen. A is a zero-conditional fact. C is a second conditional about an unlikely world. D mixes a past if-clause with will, which is not a correct first-conditional form."
    },
    "S1-Q06": {
      correct_option_id: "C",
      explanatory: "Second conditionals use a past tense in the if-clause and would + a base verb: If I had a spaceship, I would visit the moon. B is a first-conditional pattern (possible, not the unlikely form asked for). A mixes will with a past if-clause. D mixes would with a present if-clause."
    },
    "S2-Q04": {
      correct_option_id: "D",
      explanatory: "This is unlikely, so we need a second conditional: If Leo were a wizard, he would turn the rain into sweets. A uses was and will. B uses will instead of would. C mixes a present if-clause with would."
    },
    "S3-Q07": {
      correct_option_id: "C",
      explanatory: "This is a general fact, so both verbs are in the present tense. A uses a second-conditional pattern. D points to one future lesson, so it is not a general fact. B mixes a past if-clause with a present main clause."
    },
    "S5-Q06": {
      correct_option_id: "B",
      explanatory: "A first conditional needs a present if-clause: if we have some oranges, not if we had. C keeps the mistake (will + had). A mixes would with a present if-clause. D puts will in the if-clause, which we do not do in this unit."
    }
  };
  Object.keys(expected).forEach((id) => {
    const item = question(id);
    assert.equal(item.correct_option_id, expected[id].correct_option_id);
    assert.equal(item.feedback.explanatory, expected[id].explanatory);
  });
});

test("stylesheet path, relative assets, and no persistence or deploy hooks in source", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
  const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  const marking = fs.readFileSync(path.join(root, "js/marking.js"), "utf8");
  assert.match(html, /href="css\/styles\.css"/);
  assert.doesNotMatch(html, /href="\/css\//);
  assert.match(html, /src="js\/marking\.js"/);
  assert.match(html, /src="js\/app\.js"/);
  assert.doesNotMatch(html, /src="\/js\//);
  assert.match(css, /font-size:\s*18px/);
  assert.doesNotMatch(css, /@import/);
  assert.match(app, /data\/exercises\.json/);
  assert.doesNotMatch(app, /accept_notes/);
  const combined = html + "\n" + app + "\n" + marking;
  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker|sendBeacon|googleapis|googletagmanager|apps script/i);
  assert.doesNotMatch(app + "\n" + marking, /split\s*\(|sentenceCount|countSentences/);
  assert.equal(fs.existsSync(path.join(root, "css/styles.css")), true);
  assert.equal(fs.existsSync(path.join(root, ".github/workflows")), false);
  assert.equal(fs.existsSync(path.join(root, "sw.js")), false);
  assert.equal(fs.existsSync(path.join(root, "service-worker.js")), false);
});

test("readme states the classroom limits and hides internal paths", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /Answers are visible in the frontend source/);
  assert.match(readme, /classroom practice/);
  assert.match(readme, /not an anti-cheating exam/);
  assert.match(readme, /not a central mark book/);
  assert.doesNotMatch(readme, /\/workspace|\/home\/ubuntu|Moral|Dream_Big|My_Dream_Job|online-exercises_2557|uploads/);
});
