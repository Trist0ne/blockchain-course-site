/* What this site offers: every quiz and challenge, in course order. The student home, the class setup page and the
   results dashboard all read this list. Add a line for each new item.
     data   the item's data file, relative to assets/. For a lab it must register a grader in window.BC_LABS.
     flags  a lab's flags and their points, in order. */
window.BC_ITEMS = [
  { id: 'poc-02-bf', kind: 'quiz', title: 'Daily quiz: Bitcoin transactions', section: 'Bitcoin Framework', href: 'quiz/poc-02-bf/index.html', data: 'quiz/poc-02-bf/quiz-data.js' },
  { id: 'ctf-txid', kind: 'lab', title: 'Name that transaction', section: 'Bitcoin Framework', href: 'labs/ctf-txid/index.html', data: 'labs/ctf-txid/lab-data.js', flags: { f1: 100, f2: 200 } }
];
