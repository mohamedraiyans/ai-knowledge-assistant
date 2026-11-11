import { FaqService } from './faq.service';

/** A minimal in-memory stand-in for the few Redis list commands the recent list uses. */
function createRedisFake() {
  let list: string[] = [];
  const fake = {
    list: () => list,
    zrem: jest.fn(() => Promise.resolve(1)),
    lrem: jest.fn((_key: string, _count: number, value: string) => {
      list = list.filter((item) => item !== value);
      return Promise.resolve(1);
    }),
    lrange: jest.fn((_key: string, start: number, stop: number) =>
      Promise.resolve(list.slice(start, stop + 1)),
    ),
    multi: () => {
      const steps: (() => void)[] = [];
      const chain = {
        lrem: (_key: string, _count: number, value: string) => {
          steps.push(() => {
            list = list.filter((item) => item !== value);
          });
          return chain;
        },
        lpush: (_key: string, value: string) => {
          steps.push(() => {
            list = [value, ...list];
          });
          return chain;
        },
        ltrim: (_key: string, start: number, stop: number) => {
          steps.push(() => {
            list = list.slice(start, stop + 1);
          });
          return chain;
        },
        exec: () => {
          steps.forEach((step) => step());
          return Promise.resolve([]);
        },
      };
      return chain;
    },
  };
  return fake;
}

describe('FaqService recent questions', () => {
  it('lists the newest question first', async () => {
    const redis = createRedisFake();
    const faq = new FaqService(redis as never);

    await faq.recordRecent('What is leave?');
    await faq.recordRecent('Who is the CEO?');

    await expect(faq.getRecentQuestions()).resolves.toEqual(['who is the ceo', 'what is leave']);
  });

  it('moves a repeated question to the top instead of listing it twice', async () => {
    const redis = createRedisFake();
    const faq = new FaqService(redis as never);

    await faq.recordRecent('a question');
    await faq.recordRecent('another one');
    await faq.recordRecent('A Question?');

    await expect(faq.getRecentQuestions()).resolves.toEqual(['a question', 'another one']);
  });

  it('keeps only the latest 30 so the list cannot grow without bound', async () => {
    const redis = createRedisFake();
    const faq = new FaqService(redis as never);

    for (let i = 0; i < 40; i += 1) await faq.recordRecent(`question ${i}`);

    expect(redis.list()).toHaveLength(30);
    expect(redis.list()[0]).toBe('question 39');
  });

  it('ignores blank questions', async () => {
    const redis = createRedisFake();
    const faq = new FaqService(redis as never);

    await faq.recordRecent('   ?! ');

    expect(redis.list()).toEqual([]);
  });

  it('removes a pruned question from the recent list as well as the ranking', async () => {
    const redis = createRedisFake();
    const faq = new FaqService(redis as never);
    await faq.recordRecent('junk question');

    await faq.remove('Junk question?');

    expect(redis.list()).toEqual([]);
    expect(redis.zrem).toHaveBeenCalledWith('faq:counts', 'junk question');
  });
});
