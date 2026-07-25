import { query } from "../../db/client.js";

export interface ContractParties {
  contractId: string;
  userId: string;
  providerId: string;
  status: string;
}

/**
 * Who is on a contract. `contracts` belongs to the escrow module — realtime only
 * ever reads it, to decide who may join a contract room and who receives the
 * provider's live location.
 */
export async function getContractParties(
  contractId: string,
): Promise<ContractParties | null> {
  const result = await query<{
    id: string;
    user_id: string;
    provider_id: string;
    status: string;
  }>(
    "SELECT id, user_id, provider_id, status FROM contracts WHERE id = $1::uuid",
    [contractId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    contractId: row.id,
    userId: row.user_id,
    providerId: row.provider_id,
    status: row.status,
  };
}

export function isContractMember(parties: ContractParties, userId: string): boolean {
  return parties.userId === userId || parties.providerId === userId;
}
