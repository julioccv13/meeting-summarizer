/**
 * Stopwords for English and Spanish text processing
 * Used in summarization to filter out common words that don't contribute to meaning
 */

// Comprehensive English stopwords list
export const STOP_EN = new Set([
  // Articles, conjunctions, prepositions
  'the', 'and', 'a', 'to', 'of', 'in', 'is', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'as',
  'with', 'his', 'they', 'i', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but',
  'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which',
  'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these',
  'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'go',
  'see', 'no', 'way', 'could', 'my', 'than', 'been', 'who', 'its', 'now', 'did', 'get', 'come', 'made', 'may',
  
  // Additional common words
  'am', 'here', 'where', 'why', 'how', 'what', 'when', 'who', 'whom', 'whose', 'which', 'whether', 'while',
  'although', 'though', 'because', 'since', 'unless', 'until', 'before', 'after', 'during', 'above', 'below',
  'between', 'among', 'through', 'across', 'against', 'within', 'without', 'around', 'under', 'over',
  'should', 'would', 'could', 'might', 'must', 'shall', 'will', 'can', 'cannot', 'cant', 'wont', 'dont',
  'doesnt', 'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'hadnt', 'shouldnt', 'wouldnt', 'couldnt',
  'very', 'too', 'quite', 'rather', 'much', 'many', 'most', 'few', 'little', 'less', 'least', 'more',
  'only', 'just', 'even', 'also', 'still', 'yet', 'already', 'again', 'once', 'twice', 'always', 'never',
  'often', 'sometimes', 'usually', 'hardly', 'nearly', 'almost', 'enough', 'quite', 'rather', 'pretty',
  'first', 'second', 'third', 'last', 'next', 'previous', 'same', 'different', 'another', 'other', 'others',
  'yes', 'yeah', 'yep', 'ok', 'okay', 'well', 'sure', 'perhaps', 'maybe', 'probably', 'possibly',
  'actually', 'really', 'truly', 'certainly', 'definitely', 'absolutely', 'exactly', 'particularly',
  'especially', 'generally', 'specifically', 'basically', 'essentially', 'literally', 'obviously'
])

// Comprehensive Spanish stopwords list
export const STOP_ES = new Set([
  // Articles, conjunctions, prepositions
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo',
  'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre',
  'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra',
  'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto', 'mí', 'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras', 'otra',
  
  // Additional Spanish stopwords
  'ser', 'estar', 'tener', 'hacer', 'poder', 'decir', 'ir', 'ver', 'dar', 'saber', 'querer', 'llegar', 'pasar', 'deber',
  'poner', 'parecer', 'quedar', 'creer', 'hablar', 'llevar', 'dejar', 'seguir', 'encontrar', 'llamar', 'venir', 'pensar',
  'salir', 'volver', 'tomar', 'conocer', 'vivir', 'sentir', 'tratar', 'mirar', 'contar', 'empezar', 'esperar', 'buscar',
  'existir', 'entrar', 'trabajar', 'escribir', 'producir', 'ocurrir', 'permitir', 'aparecer', 'considerar', 'acabar',
  
  'él', 'ella', 'ello', 'ellas', 'nosotros', 'nosotras', 'vosotros', 'vosotras', 'ustedes',
  'mi', 'tu', 'nuestro', 'nuestra', 'nuestros', 'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras',
  'mio', 'mía', 'míos', 'mías', 'tuyo', 'tuya', 'tuyos', 'tuyas', 'suyo', 'suya', 'suyos', 'suyas',
  
  'poco', 'mucho', 'mucha', 'muchos', 'muchas', 'tanto', 'tanta', 'tantos', 'tantas', 'demasiado', 'bastante',
  'algo', 'nada', 'alguien', 'nadie', 'alguno', 'alguna', 'algunos', 'algunas', 'ninguno', 'ninguna', 'ningun',
  'cada', 'cualquier', 'cualquiera', 'cualesquiera', 'todo', 'toda', 'todos', 'todas', 'mismo', 'misma', 'mismos', 'mismas',
  
  'aquí', 'ahí', 'allí', 'acá', 'allá', 'arriba', 'abajo', 'adelante', 'atrás', 'afuera', 'adentro',
  'cerca', 'lejos', 'dentro', 'fuera', 'encima', 'debajo', 'delante', 'detrás', 'alrededor',
  
  'ahora', 'entonces', 'luego', 'después', 'antes', 'mientras', 'siempre', 'nunca', 'jamás', 'todavía', 'aún',
  'recién', 'temprano', 'tarde', 'pronto', 'ayer', 'hoy', 'mañana', 'anoche', 'anteayer', 'pasado',
  
  'bien', 'mal', 'mejor', 'peor', 'así', 'tan', 'tanto', 'cuanto', 'cómo', 'dónde', 'cuándo', 'cuánto', 'cuánta', 'cuántos', 'cuántas',
  
  'sí', 'no', 'tal', 'vez', 'quizá', 'quizás', 'acaso', 'apenas', 'casi', 'solo', 'sólo', 'solamente', 'únicamente',
  'incluso', 'inclusive', 'además', 'tampoco', 'sino', 'excepto', 'salvo', 'menos', 'según', 'conforme',
  
  // Common interjections and expressions
  'bueno', 'pues', 'claro', 'desde', 'luego', 'por', 'supuesto', 'efectivamente', 'realmente', 'verdaderamente'
])

// French stopwords (basic set for potential future expansion)
export const STOP_FR = new Set([
  'le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir', 'que', 'pour', 'dans', 'ce', 'son', 'une', 'sur',
  'avec', 'ne', 'se', 'pas', 'tout', 'plus', 'par', 'grand', 'en', 'une', 'être', 'et', 'en', 'avoir', 'que', 'pour'
])

// Language detection helpers
export const LANGUAGE_INDICATORS = {
  en: new Set(['the', 'and', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'will', 'would', 'could', 'should']),
  es: new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'en', 'es', 'son', 'está', 'están', 'tiene', 'tienen']),
  fr: new Set(['le', 'la', 'les', 'de', 'du', 'des', 'que', 'qui', 'est', 'sont', 'avoir', 'être', 'avec', 'dans'])
}

/**
 * Get stopwords set for a given language
 */
export function getStopwords(language: string): Set<string> {
  const lang = language.toLowerCase().substring(0, 2)
  
  switch (lang) {
    case 'en':
      return STOP_EN
    case 'es':
      return STOP_ES
    case 'fr':
      return STOP_FR
    default:
      return STOP_EN // Default to English
  }
}

/**
 * Simple language detection based on common words
 */
export function detectLanguage(text: string): 'en' | 'es' | 'fr' {
  if (!text || text.length < 50) return 'en' // Default to English for short texts
  
  const words = text.toLowerCase().split(/\s+/).slice(0, 100) // Check first 100 words
  const scores = {
    en: 0,
    es: 0,
    fr: 0
  }
  
  for (const word of words) {
    for (const [lang, indicators] of Object.entries(LANGUAGE_INDICATORS)) {
      if (indicators.has(word)) {
        scores[lang as keyof typeof scores]++
      }
    }
  }
  
  // Return language with highest score, default to English
  const maxScore = Math.max(scores.en, scores.es, scores.fr)
  if (maxScore === 0) return 'en'
  
  if (scores.es === maxScore) return 'es'
  if (scores.fr === maxScore) return 'fr'
  return 'en'
}

/**
 * Remove stopwords from a text array
 */
export function removeStopwords(words: string[], language: string = 'en'): string[] {
  const stopwords = getStopwords(language)
  return words.filter(word => {
    const cleaned = word.toLowerCase().replace(/[^\w]/g, '')
    return cleaned.length > 1 && !stopwords.has(cleaned)
  })
}

/**
 * Check if a word is a stopword in the given language
 */
export function isStopword(word: string, language: string = 'en'): boolean {
  const stopwords = getStopwords(language)
  const cleaned = word.toLowerCase().replace(/[^\w]/g, '')
  return stopwords.has(cleaned)
}
