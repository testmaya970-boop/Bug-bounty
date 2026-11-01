// Organization accounts must sign up with a work email: no consumer webmail, no
// temporary/disposable inbox. Checked in SignUpForm and again in signUpAction (and on an
// organization account's email change). A blocklist, not an allowlist: a small company's
// own custom domain this list has never heard of is accepted.
// ponytail: static list; swap for a maintained disposable-domain feed if abuse shows up.

// Consumer webmail, matched on any country TLD (gmail.com, yahoo.co.in, hotmail.co.uk...).
const PERSONAL_PROVIDERS = new Set([
  "gmail", "googlemail", "yahoo", "ymail", "rocketmail", "outlook", "hotmail", "live", "msn", "windowslive",
  "icloud", "aol", "aim", "protonmail", "proton", "pm", "gmx", "zoho", "zohomail", "yandex", "mail", "inbox",
  "rediffmail", "rediff", "tutanota", "tuta", "tutamail", "fastmail", "hushmail", "mailfence", "lycos",
  "qq", "163", "126", "yeah", "sina", "sohu", "aliyun", "naver", "hanmail", "daum", "rambler", "seznam",
  "libero", "virgilio", "laposte", "orange", "wanadoo", "free", "sfr", "web", "t-online", "freenet", "bigpond",
  "optusnet", "shaw", "rogers", "sympatico", "comcast", "verizon", "att", "sbcglobal", "bellsouth", "cox",
  "charter", "earthlink", "juno", "netzero", "btinternet", "sky", "talktalk", "ntlworld", "uol", "bol", "terra",
]);
// Bare domains whose label is too generic to match on every TLD.
const PERSONAL_DOMAINS = new Set(["me.com", "mac.com", "hey.com", "duck.com", "skiff.com", "ymail.com", "email.com", "usa.com", "post.com", "myself.com", "consultant.com", "engineer.com"]);

// Temporary / disposable inbox services (and any subdomain of them).
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com", "sharklasers.com",
  "grr.la", "pokemail.net", "spam4.me", "10minutemail.com", "10minutemail.net", "20minutemail.com", "temp-mail.org",
  "temp-mail.io", "tempmail.com", "tempmail.net", "tempmail.dev", "tempmailo.com", "tempail.com", "tempr.email",
  "tempinbox.com", "temporarymail.com", "throwawaymail.com", "yopmail.com", "yopmail.net", "yopmail.fr", "trashmail.com",
  "trashmail.net", "trashmail.de", "getnada.com", "nada.email", "maildrop.cc", "dispostable.com", "fakeinbox.com",
  "mohmal.com", "emailondeck.com", "mintemail.com", "mailnesia.com", "moakt.com", "mailcatch.com", "spamgourmet.com",
  "mytemp.email", "burnermail.io", "33mail.com", "anonaddy.me", "simplelogin.com", "simplelogin.co", "relay.firefox.com",
  "mozmail.com", "inboxkitten.com", "harakirimail.com", "discard.email", "discardmail.com", "mailpoof.com", "emailfake.com",
  "fakemail.net", "spambox.us", "mailtemp.net", "tmpmail.org", "tmpmail.net", "tmail.ws", "linshiyouxiang.net",
  "mail.tm", "mail.gw", "internxt.com", "dropmail.me", "10mail.org", "emltmp.com", "tmpeml.com", "byom.de", "mvrht.com",
  "mailsac.com", "inboxbear.com", "luxusmail.org", "minuteinbox.com", "fexbox.org", "spamdecoy.net", "cuvox.de",
  "dayrep.com", "einrot.com", "fleckens.hu", "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us",
  "armyspy.com",
]);

const PROVIDER_ON_ANY_TLD = /^([a-z0-9-]+)\.(?:[a-z]{2,3})(?:\.[a-z]{2})?$/;

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) if (DISPOSABLE_DOMAINS.has(labels.slice(i).join("."))) return true;
  return false;
}

export function isBusinessEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain || !domain.includes(".")) return false;
  if (PERSONAL_DOMAINS.has(domain) || isDisposableEmail(email)) return false;
  const provider = PROVIDER_ON_ANY_TLD.exec(domain)?.[1];
  return !(provider && PERSONAL_PROVIDERS.has(provider));
}
