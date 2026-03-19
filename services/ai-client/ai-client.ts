import { readFileSync } from 'node:fs';
import { OpenRouterProvider } from './providers/open-router/open-router-provider.ts';

const openRouter = new OpenRouterProvider({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.GENNADY_OPENROUTER_API_KEY,
});

// const llmProxy = createOpenAiLikeProvider({
//   baseURL: 'https://llm-proxy.vkteam.ru/v1',
//   apiKey: process.env.LLM_PROXY_API_KEY,
// });

const models = (await openRouter.getModels()).filter((x) =>
  x.id.includes('google/gemma-3n-e2b-it:free')
);
console.info(models.map((x) => x.id));

const musicPromptTemplate = readFileSync('assistant/music/music-prompt.md', 'utf-8');

const text = `Мини-альбом барнаульской инди-команды, который сложно вписать в привычные жанровые рамки. Тут мрачный трипховый инди-поп с нотками британской электроники 90-х соседствует матроковыми гитарными переборами и полуакустической авторской песней с холодным отстранённым вокалом. Три песни-упражнения в поисках формы для выражения собственных чувств через музыку. 

русский бильярд — «Русский бильярд: упражнение 328» 
Слушать на всех площадках

Погружение на самое дно, где остаётся только научиться дышать под водой, в новом мини-альбоме Вики Кравцовой. На релизе она обратилась в сторону более мрачного альтернативного поп-рока с вкраплениями холодной и прямолинейной электроники.
 
вика кравцова — «хрестоматия подводной жизни» 
Слушать на всех площадках

«Наносное, земное, пустое пусть оставит меня в покое» – повторяем за Надей Гринцкевич и медленно выдыхаем. Кажется, именно ради этого появился новый трек. Сингл – мантра покоя, переливающаяся всеми звуками нежности, помогает пережить всю суету сует. 

НААДЯ – «Выдыхаю»
`;

await Promise.all(
  models.map(async (model) => {
    try {
      const start = performance.now();
      const prompt = musicPromptTemplate.replace(/%TEXT%/, text);

      const result = await openRouter.generateText(model.id, prompt);

      console.info(`${model.id} (${(performance.now() - start).toFixed(2)}ms)`, result);
    } catch (error: any) {
      console.error(`${model.id} error`, error.statusCode, error.responseBody);
    }
  })
);
