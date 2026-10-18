import "server-only";
import bcrypt from "bcryptjs";

// Hash of a random string; compared against when the user does not exist so
// that response time does not reveal whether a username is valid.
const DUMMY_HASH = "$2b$12$0KADdJFJf/l4snliCp.Umum5k2A4KeQrg32wSpxW6rGMRU2BVtskq";

export async function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return Boolean(hash) && ok;
}
