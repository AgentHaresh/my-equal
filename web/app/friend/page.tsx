import Messenger from "../Messenger";

// The other person's side of a chat, for a second window or a second phone.
// Which contact it is comes from the "c" query parameter, read in the browser.
export default function Friend() {
  return <Messenger role="them" />;
}
