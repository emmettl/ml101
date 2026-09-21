/**
 * Job words whose lean is measured in the Fairness Lab, and the word pairs that define the
 * direction they are measured along. scripts/make-glove.mjs reads this file so that every word
 * here is in the shipped vectors.
 */

export const PAIRS: readonly (readonly [string, string])[] = [
  ["he", "she"],
  ["man", "woman"],
  ["his", "her"],
  ["father", "mother"],
  ["son", "daughter"],
  ["brother", "sister"],
  ["boy", "girl"],
  ["male", "female"],
];

export const OCCUPATIONS: readonly string[] = [
  "accountant",
  "architect",
  "banker",
  "boss",
  "captain",
  "carpenter",
  "cashier",
  "chef",
  "cleaner",
  "dancer",
  "dentist",
  "doctor",
  "electrician",
  "engineer",
  "farmer",
  "hairdresser",
  "housekeeper",
  "journalist",
  "judge",
  "lawyer",
  "librarian",
  "manager",
  "mechanic",
  "nanny",
  "nurse",
  "pilot",
  "plumber",
  "professor",
  "programmer",
  "receptionist",
  "scientist",
  "secretary",
  "singer",
  "soldier",
  "surgeon",
  "teacher",
];
