import type { DatabaseSync } from 'node:sqlite'
import type {
  OrderIssue,
  SupportCase,
  SupportEvent,
  SupportResolution,
  OrderIssueSummary,
} from '../../../domain/types.ts'
type Row = Record<string, unknown>
import { getUser } from './queries-users.ts'
export function getOrderIssue(
  db: DatabaseSync,
  orderId: string,
): OrderIssue | null {
  const row = db
    .prepare('SELECT * FROM order_issues WHERE order_id=?')
    .get(orderId) as Row | undefined
  if (!row) return null
  const messages = db
    .prepare(
      'SELECT id,author_role,author_name,body,created_at FROM order_issue_messages WHERE issue_id=? ORDER BY rowid',
    )
    .all(String(row.id)) as Row[]
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    category: row.category as OrderIssue['category'],
    status: row.status as OrderIssue['status'],
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    messages: messages.map((message) => ({
      id: String(message.id),
      authorRole: message.author_role as 'buyer' | 'cafe' | 'admin',
      authorName: String(message.author_name),
      body: String(message.body),
      createdAt: String(message.created_at),
    })),
    support: getSupportCase(db, String(row.id)),
  }
}

export function getSupportCase(
  db: DatabaseSync,
  issueId: string,
): SupportCase | null {
  const row = db
    .prepare(
      'SELECT c.*,u.name AS assignee_name FROM support_cases c LEFT JOIN users u ON u.id=c.assignee_id WHERE c.issue_id=?',
    )
    .get(issueId) as Row | undefined
  if (!row) return null
  const events = db
    .prepare('SELECT event FROM support_events WHERE case_id=? ORDER BY rowid')
    .all(String(row.id)) as Row[]
  return {
    id: String(row.id),
    kind: row.kind as SupportCase['kind'],
    status: row.status as SupportCase['status'],
    revision: Number(row.revision),
    reporterName: String(row.reporter_name),
    reporterRole: row.reporter_role as SupportCase['reporterRole'],
    assignee:
      row.assignee_id === null
        ? null
        : getSupportAssignee(db, String(row.assignee_id)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    resolution:
      row.resolution === null
        ? null
        : (JSON.parse(String(row.resolution)) as SupportResolution),
    history: events.map(
      (event) => JSON.parse(String(event.event)) as SupportEvent,
    ),
  }
}

export function getSupportAssignee(
  db: DatabaseSync,
  id: string,
): NonNullable<SupportCase['assignee']> {
  const user = getUser(db, id)!
  return {
    id: user.id,
    name: user.name,
    available: user.role === 'admin' && user.emailVerified === true,
  }
}

export function listOrderIssues(
  db: DatabaseSync,
  venueId: string,
): OrderIssueSummary[] {
  const rows = db
    .prepare(
      `SELECT i.order_id,i.status,i.updated_at FROM order_issues i
        JOIN orders o ON o.id=i.order_id WHERE o.venue_id=? ORDER BY i.updated_at DESC,i.id DESC`,
    )
    .all(venueId) as Row[]
  return rows.map((row) => ({
    orderId: String(row.order_id),
    status: row.status as OrderIssue['status'],
    updatedAt: String(row.updated_at),
  }))
}
