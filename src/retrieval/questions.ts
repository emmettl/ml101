/**
 * The exam the retriever sits. Every question has a short answer and a piece of evidence copied
 * word for word from the book, so "was the answer retrieved?" is a fact the lab can check and
 * not a matter of opinion. Half are asked in the book's own words; half are asked the way a
 * reader who has not got the book open would ask them.
 */

import type { Question } from "./engine";

export const QUESTIONS: readonly Question[] = [
  {
    id: "jar",
    ask: "What was the jar from the shelves labelled?",
    answer: "Orange marmalade",
    evidence: 'it was labelled "ORANGE MARMALADE"',
    wording: "book",
  },
  {
    id: "watch",
    ask: "What did the Rabbit take out of its waistcoat-pocket?",
    answer: "A watch",
    evidence: "took a watch out of its waistcoat-pocket",
    wording: "book",
  },
  {
    id: "key",
    ask: "What was on the three-legged glass table?",
    answer: "A tiny golden key",
    evidence: "there was nothing on it except a tiny golden key",
    wording: "book",
  },
  {
    id: "bottle",
    ask: "What words were printed on the paper label round the neck of the bottle?",
    answer: "Drink me",
    evidence: 'a paper label, with the words "DRINK ME,"',
    wording: "book",
  },
  {
    id: "cake",
    ask: "What words were marked in currants on the very small cake?",
    answer: "Eat me",
    evidence: '"EAT ME" were beautifully marked in currants',
    wording: "book",
  },
  {
    id: "dry",
    ask: "What did the Dodo say was the best thing to get us dry?",
    answer: "A Caucus-race",
    evidence: "the best thing to get us dry would be a Caucus-race",
    wording: "book",
  },
  {
    id: "thimble",
    ask: "What else did Alice have in her pocket for a prize?",
    answer: "A thimble",
    evidence: '"Only a thimble," said Alice sadly',
    wording: "book",
  },
  {
    id: "hookah",
    ask: "What was the large blue caterpillar quietly smoking?",
    answer: "A long hookah",
    evidence: "quietly smoking a long hookah",
    wording: "book",
  },
  {
    id: "pepper",
    ask: "What was there too much of in the soup?",
    answer: "Pepper",
    evidence: "too much pepper in that soup",
    wording: "book",
  },
  {
    id: "riddle",
    ask: "Why is a raven like what, in the Hatter's riddle?",
    answer: "A writing-desk",
    evidence: "Why is a raven like a writing-desk?",
    wording: "book",
  },
  {
    id: "sisters",
    ask: "What were the names of the three little sisters in the Dormouse's story?",
    answer: "Elsie, Lacie and Tillie",
    evidence: "their names were Elsie, Lacie, and Tillie",
    wording: "book",
  },
  {
    id: "well",
    ask: "What kind of well did the sisters live at the bottom of?",
    answer: "A treacle-well",
    evidence: "It was a treacle-well",
    wording: "book",
  },
  {
    id: "jar-own",
    ask: "Which preserve was named on the empty container Alice picked up while falling?",
    answer: "Orange marmalade",
    evidence: 'it was labelled "ORANGE MARMALADE"',
    wording: "own",
  },
  {
    id: "watch-own",
    ask: "What timepiece was the hurrying bunny carrying?",
    answer: "A watch",
    evidence: "took a watch out of its waistcoat-pocket",
    wording: "own",
  },
  {
    id: "comfits-own",
    ask: "Which sweets did Alice hand round as awards after the running contest?",
    answer: "A box of comfits",
    evidence: "pulled out a box of comfits",
    wording: "own",
  },
  {
    id: "maid-own",
    ask: "Whose name did the Rabbit wrongly call Alice when he sent her to fetch his things?",
    answer: "Mary Ann",
    evidence: "Why, Mary Ann, what are you doing out here?",
    wording: "own",
  },
  {
    id: "frame-own",
    ask: "What did the Rabbit smash when Alice snatched at him through the window?",
    answer: "A cucumber-frame",
    evidence: "it had fallen into a cucumber-frame",
    wording: "own",
  },
  {
    id: "height-own",
    ask: "How tall is the Caterpillar?",
    answer: "Exactly three inches",
    evidence: "it was exactly three inches high",
    wording: "own",
  },
  {
    id: "pig-own",
    ask: "Which animal did the Duchess's infant become?",
    answer: "A pig",
    evidence: "it was neither more nor less than a pig",
    wording: "own",
  },
  {
    id: "grin-own",
    ask: "What was the last part of the Cat to disappear?",
    answer: "Its grin",
    evidence: "ending with the grin",
    wording: "own",
  },
  {
    id: "butter-own",
    ask: "What did the March Hare use to try to repair the Hatter's watch?",
    answer: "The best butter",
    evidence: '"It was the best butter,"',
    wording: "own",
  },
  {
    id: "song-own",
    ask: "Which song did the Hatter perform at the Queen's concert?",
    answer: "Twinkle, twinkle, little bat",
    evidence: "I had to sing 'Twinkle, twinkle, little bat!",
    wording: "own",
  },
  {
    id: "time-own",
    ask: "What hour is it permanently at the tea-party?",
    answer: "Six o'clock",
    evidence: "It's always six o'clock now",
    wording: "own",
  },
  {
    id: "french-own",
    ask: "Which invader did Alice imagine the Mouse had arrived with?",
    answer: "William the Conqueror",
    evidence: "come over with William the Conqueror",
    wording: "own",
  },
];
