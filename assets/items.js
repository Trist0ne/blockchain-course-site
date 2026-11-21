/* What this site offers, in course order. The course map, the instructor dashboard and the class setup page all read
   this file.
     BC_DAYS   the days of the course. An instructor unlocks each day in class.
     BC_ITEMS  every quiz and challenge: which day it belongs to, and for a challenge its flags and their points.
               `data` is the item's data file, relative to assets/. A lab's must register a grader in window.BC_LABS. */
window.BC_DAYS = [
  { n: 1, title: 'Introduction' },
  { n: 2, title: 'Cryptography' },
  { n: 3, title: 'Distributed systems' },
  { n: 4, title: 'Ledgers and consensus' },
  { n: 5, title: 'Permissioned chains' },
  { n: 6, title: 'Bitcoin' },
  { n: 7, title: 'Ethereum' },
  { n: 8, title: 'Tokens and forensics' },
  { n: 9, title: 'Forensics and the real world' },
  { n: 10, title: 'Review and final exam' }
];
window.BC_ITEMS = [
  { id: 'poc-02-bf', day: 6, kind: 'quiz', title: 'Daily quiz: Bitcoin transactions', href: 'quiz/poc-02-bf/index.html', data: 'quiz/poc-02-bf/quiz-data.js' },
  { id: 'ctf-txid', day: 6, kind: 'lab', title: 'Name that transaction', href: 'labs/ctf-txid/index.html', data: 'labs/ctf-txid/lab-data.js', flags: { f1: 100, f2: 200 } }
];
