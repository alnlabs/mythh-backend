const ADULT_SLUGS = new Set([
  "a-designated-driver-can-still-have-one-beer",
  "a-high-tolerance-means-you-should-drink-more-to-feel-it",
  "absinthe-makes-you-hallucinate-from-wormwood-magic",
  "al-anon-is-only-for-people-who-drink",
  "alcohol-helps-you-sleep-better",
  "alcohol-warms-you-up-in-the-cold",
  "beer-before-liquor-never-been-sicker-is-chemistry",
  "caffeine-in-a-cocktail-cancels-the-alcohol",
  "chewing-tobacco-is-a-safe-way-to-use-nicotine",
  "clinking-glasses-without-eye-contact-means-seven-years-of-bad-sex-as-sci",
  "coffee-after-drinking-sobers-you-for-the-road",
  "coffee-sobers-you-up-so-you-can-drive",
  "craft-beer-is-non-alcoholic-because-it-is-craft",
  "drunk-words-are-sober-thoughts-as-a-reliable-law",
  "eating-bread-soaks-up-alcohol-already-in-your-blood",
  "energy-drink-mixers-are-a-sports-performance-plan",
  "hair-of-the-dog-cures-a-hangover",
  "hair-of-the-dog-is-a-cure",
  "hangover-means-the-fun-was-worth-it-as-health-math",
  "it-is-fine-to-leave-a-drunk-friend-alone-to-sleep-on-their-back",
  "kids-cannot-tell-when-adults-are-drunk",
  "light-cigarettes-are-a-safer-cigarette",
  "light-cigarettes-cut-risk-in-a-simple-half",
  "marijuana-has-no-risks-because-it-is-a-plant",
  "menthol-cigarettes-are-less-harmful-because-they-feel-cool",
  "mixing-drinks-makes-you-drunker-than-the-same-alcohol-in-one-type",
  "nicotine-pouches-reverse-heart-disease",
  "non-alcoholic-beer-cannot-contain-any-alcohol",
  "one-drink-a-day-is-proven-to-be-healthy-for-everyone",
  "quitting-cold-turkey-is-safest-for-every-heavy-drinker-at-home",
  "tolerance-means-you-are-safer-to-drive",
  "vaping-is-just-water-vapor",
  "walking-it-off-metabolizes-alcohol-faster",
  "wine-mom-culture-is-automatically-healthy-because-it-is-a-joke",
  "withdrawal-is-only-for-real-alcoholics-as-a-slur",
  "you-can-flush-kidney-stones-with-a-beer-and-a-long-drive-on-a-bad-road",
  "you-can-sober-up-quickly-with-a-cold-shower-and-coffee",
  "you-can-sweat-out-a-hangover-in-a-sauna-instead-of-drinking-water",
  "you-can-train-to-hold-your-liquor-as-a-liver-upgrade",
  "you-cannot-be-a-problem-drinker-if-you-only-drink-expensive-bottles",
  "you-cannot-get-addicted-to-cannabis",
  "you-cannot-get-liver-trouble-unless-you-drink-every-day",
  "you-should-walk-a-very-drunk-person-for-miles",
]);

export function isAdultSlug(slug: string) {
  return ADULT_SLUGS.has(slug);
}

export function hideAdultContent(identity: { userId?: string | null }) {
  return !identity.userId;
}
