import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { describe, test } from 'node:test'

const execute = promisify(execFile)
const isolated = process.env.PGHOST?.startsWith('/tmp/greenwater-booking.') && process.env.PGPORT === '55443'

async function query(sql) {
  const { stdout } = await execute(`${process.env.PG_BIN}/psql`, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-c', sql], { timeout: 15000 })
  return stdout.trim()
}

async function fixture({ vessel = 1, start = '2035-01-01', end = '2035-01-03' } = {}) {
  const project = await query(`select booking_test.project('Race ${randomUUID()}')`)
  const bid = await query(`select booking_test.bid('${project}', ${vessel}, '${start}Z', '${end}Z')`)
  return { project, bid }
}

function transition({ project, bid }, action, delay = false) {
  return query(`begin; ${delay ? "set local booking_test.delay = 'on';" : ''} select booking_test.transition('${project}', '${bid}', '${action}'); commit;`).then(JSON.parse)
}

function assertOneWinner(results) {
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  const loser = results.find((result) => result.status === 'rejected')
  assert.match(loser.reason.stderr, /PT409|23P01/)
}

describe('isolated PostgreSQL booking concurrency', { skip: !isolated }, () => {
  test('simultaneous accepts leave one accepted bid and one declined', async () => {
    await query(`create function booking_test.delay_write() returns trigger language plpgsql as $$ begin if current_setting('booking_test.delay', true) = 'on' then perform pg_sleep(0.2); end if; return new; end; $$;
      create trigger booking_test_delay before update on project_bids for each row execute function booking_test.delay_write();`)
    const first = await fixture()
    const second = { project: first.project, bid: await query(`select booking_test.bid('${first.project}', 2)`) }
    const results = await Promise.allSettled([transition(first, 'accept', true), transition(second, 'accept', true)])
    assertOneWinner(results)
    assert.equal(await query(`select count(*) from project_bids where project_id = '${first.project}' and accepted_at is not null and declined_at is null`), '1')
    assert.equal(await query(`select count(*) from project_bids where project_id = '${first.project}' and declined_at is not null`), '1')
  })

  test('simultaneous confirmation retries return one cruise', async () => {
    const booking = await fixture({ start: '2035-02-01', end: '2035-02-03' })
    await transition(booking, 'accept')
    const results = await Promise.all([transition(booking, 'confirm', true), transition(booking, 'confirm', true)])
    assert.equal(results[0].cruise_id, results[1].cruise_id)
    assert.deepEqual(results.map((result) => result.changed).sort(), [false, true])
    assert.equal(await query(`select count(*) from timeline_entries where cruise_id = '${results[0].cruise_id}' and vessel_id = 1`), '1')
  })

  test('different projects cannot simultaneously book the same vessel', async () => {
    const first = await fixture({ start: '2035-03-01', end: '2035-03-03' })
    const second = await fixture({ start: '2035-03-01', end: '2035-03-03' })
    await transition(first, 'accept')
    await transition(second, 'accept')
    const before = Number(await query('select count(*) from cruises'))
    const results = await Promise.allSettled([transition(first, 'confirm', true), transition(second, 'confirm', true)])
    assertOneWinner(results)
    assert.equal(Number(await query('select count(*) from cruises')), before + 1)
    assert.equal(await query(`select count(*) from projects where id in ('${first.project}', '${second.project}') and cruise_id is not null`), '1')
  })

  test('shared researchers cannot be double-booked across vessels', async () => {
    const first = await fixture({ start: '2035-04-01', end: '2035-04-03' })
    const second = await fixture({ vessel: 2, start: '2035-04-01', end: '2035-04-03' })
    const person = await query("insert into people (name) values ('Concurrent scientist') returning id")
    await query(`insert into project_people (project_id, role_id, person_id, name)
      select project.id, role.id, '${person}', 'Concurrent scientist' from projects project cross join cruise_roles role
      where project.id in ('${first.project}', '${second.project}') and role.slug = 'pi'`)
    await transition(first, 'accept')
    await transition(second, 'accept')
    const before = Number(await query('select count(*) from cruises'))
    const results = await Promise.allSettled([transition(first, 'confirm', true), transition(second, 'confirm', true)])
    assertOneWinner(results)
    assert.equal(Number(await query('select count(*) from cruises')), before + 1)
    assert.equal(await query(`select count(*) from timeline_entries where person_id = '${person}'`), '1')
  })

  for (const [index, action] of ['withdraw', 'decline'].entries()) {
    test(`${action} racing confirmation cannot cancel a confirmed bid`, async () => {
      const booking = await fixture({ start: `2035-0${index + 5}-01`, end: `2035-0${index + 5}-03` })
      await transition(booking, 'accept')
      const results = await Promise.allSettled([transition(booking, action, true), transition(booking, 'confirm', true)])
      assertOneWinner(results)
      assert.equal(await query(`select count(*) from project_bids where id = '${booking.bid}' and confirmed_at is not null and (declined_at is not null or withdrawn_at is not null)`), '0')
      assert.equal(await query(`select (project.cruise_id is not distinct from bid.cruise_id) from projects project join project_bids bid on bid.project_id = project.id where bid.id = '${booking.bid}'`), 't')
    })
  }
})


test('competing profile confirmations link the directory person to exactly one member', { skip: !isolated }, async () => {
  const [adminA, adminB, memberA, memberB, person] = Array.from({ length: 5 }, () => randomUUID())
  await query(`insert into profiles(id,is_admin) values ('${adminA}',true),('${adminB}',true),('${memberA}',false),('${memberB}',false);
    insert into people(id,name) values ('${person}','Directory scientist')`)
  const [first, second] = await Promise.all([memberA, memberB].map(member =>
    query(`select request_person_link('${member}','${person}',null,null)`)))
  const results = await Promise.allSettled([[adminA, first], [adminB, second]].map(([admin, request]) =>
    query(`begin; select review_person_link('${admin}','${request}','confirmed'); select pg_sleep(0.15); commit`)))
  assertOneWinner(results)
  const winner = results[0].status === 'fulfilled' ? memberA : memberB
  assert.equal(await query(`select profile_id from people where id='${person}'`), winner)
  assert.equal(await query(`select count(*) from person_link_requests where person_id='${person}' and
    status = case when profile_id='${winner}' then 'confirmed' else 'declined' end and reviewed_at is not null`), '2')
})
