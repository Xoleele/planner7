/*
  IMPORTAR ITINERARIO EUROPA 2026 EN PLANNER7

  Uso:
  1. Abre https://planner7.vercel.app e inicia sesión.
  2. Abre las herramientas de desarrollador (F12) y entra en Console.
  3. Copia y pega este archivo completo y presiona Enter.
  4. Revisa la vista previa y confirma la importación.

  Seguridad:
  - Solo crea tareas nuevas; no modifica ni elimina tareas existentes.
  - Usa identificadores estables para que ejecutarlo otra vez no duplique tareas.
  - Guarda un respaldo previo en localStorage antes de escribir.
  - Verifica en Supabase que las tareas realmente hayan quedado guardadas.
  - Genera un informe JSON de diagnóstico con cada fase de la ejecución.
  - Omite nombres, RUT, correos y números de billete del documento original.
*/

(async () => {
  'use strict';

  const IMPORT_NAME = 'Europa 2026';
  const IMPORT_VERSION = 3;
  const IMPORT_KEY = 'planner7-europa-2026';
  const APP_HOST = 'planner7.vercel.app';
  const LINE_BREAK = String.fromCharCode(10);
  const TRIP_TAGS = {
    transport: {
      id: 'tag-europa-transporte-2026',
      name: 'Europa · Transporte',
      color: { bg: '#f49734', text: '#ffffff', border: '#f49734' },
      colorIndex: 0,
      keywords: ['viaje', 'europa', 'vuelo', 'traslado', 'transporte']
    },
    included: {
      id: 'tag-europa-visitas-incluidas-2026',
      name: 'Europa · Visitas incluidas',
      color: { bg: '#30c55f', text: '#ffffff', border: '#30c55f' },
      colorIndex: 3,
      keywords: ['viaje', 'europa', 'visita', 'incluido']
    },
    optional: {
      id: 'tag-europa-opcionales-tiempo-libre-2026',
      name: 'Europa · Opcionales y tiempo libre',
      color: { bg: '#a978f7', text: '#ffffff', border: '#a978f7' },
      colorIndex: 8,
      keywords: ['viaje', 'europa', 'opcional', 'tiempo libre']
    },
    lodging: {
      id: 'tag-europa-alojamiento-2026',
      name: 'Europa · Alojamiento',
      color: { bg: '#50a9ed', text: '#ffffff', border: '#50a9ed' },
      colorIndex: 6,
      keywords: ['viaje', 'europa', 'hotel', 'alojamiento']
    }
  };

  const summaryItinerary = [
    {
      key: 'vuelo-ida-ib114',
      date: '2026-08-03',
      title: 'Vuelo IB 114 · Santiago → Madrid',
      startTime: '23:20',
      duration: 700,
      alarm: true,
      description:
        '11h 40m. El horario de la tarea corresponde a la hora local de salida en Santiago. ' +
        'Llegada: 4 de agosto, 17:00, hora local de Madrid-Barajas (MAD). ' +
        'Clase Economy, tarifa Óptima y equipaje facturado de 23 kg. Reserva: M48TE / D1E45GC1D.'
    },
    {
      key: 'dia-01-madrid',
      date: '2026-08-04',
      title: 'Día 1 · Llegada a Madrid',
      description:
        'Llegada a Madrid-Barajas, asistencia y traslado incluido al hotel. ' +
        'Resto del día libre. Alojamiento: Puerta de Toledo Hotel 3*. ' +
        'Inicio del circuito WEU228.'
    },
    {
      key: 'dia-02-madrid',
      date: '2026-08-05',
      title: 'Día 2 · Madrid',
      description:
        'Desayuno y visita panorámica de Madrid por la mañana. Tarde libre. ' +
        'Opcional: excursión a Toledo, incluida en Experiencias. ' +
        'Alojamiento: Puerta de Toledo Hotel 3*.'
    },
    {
      key: 'dia-03-madrid-san-sebastian-burdeos',
      date: '2026-08-06',
      title: 'Día 3 · Madrid → San Sebastián → Burdeos',
      description:
        'Desayuno buffet y salida hacia San Sebastián. Breve panorámica de la ciudad en bus. ' +
        'Continuación hacia Francia y llegada a Burdeos. Alojamiento: B&B Bègles.'
    },
    {
      key: 'dia-04-burdeos-loira-blois-paris',
      date: '2026-08-07',
      title: 'Día 4 · Burdeos → Valle del Loira → Blois → París',
      description:
        'Desayuno y salida por el Valle del Loira. Parada en Blois y tiempo libre. ' +
        'Opcional: visita a uno de los castillos de la región. Continuación hacia París. ' +
        'Alojamiento: B&B Gennevilliers Asnières 3*.'
    },
    {
      key: 'dia-05-paris',
      date: '2026-08-08',
      title: 'Día 5 · París',
      description:
        'Desayuno y visita panorámica de París por la mañana, con parada fotográfica en la Torre Eiffel. ' +
        'Opcional: crucero por el Sena, incluido en Experiencias. ' +
        'Opcional nocturno: cabaret parisino con copa de champagne. ' +
        'Alojamiento: B&B Gennevilliers Asnières 3*.'
    },
    {
      key: 'dia-06-paris',
      date: '2026-08-09',
      title: 'Día 6 · París libre',
      description:
        'Desayuno y día libre. Opcional: Palacio de Versalles. ' +
        'Opcional por la tarde: Montmartre y Barrio Latino. ' +
        'Alojamiento: B&B Gennevilliers Asnières 3*.'
    },
    {
      key: 'dia-07-paris-brujas-amsterdam',
      date: '2026-08-10',
      title: 'Día 7 · París → Brujas → Ámsterdam',
      description:
        'Desayuno y salida hacia Brujas. Tiempo libre para recorrer su centro histórico y sus canales. ' +
        'Continuación hacia Ámsterdam. Alojamiento: Ibis Amsterdam City West.'
    },
    {
      key: 'dia-08-amsterdam',
      date: '2026-08-11',
      title: 'Día 8 · Ámsterdam',
      description:
        'Desayuno y visita panorámica de Ámsterdam por la mañana. ' +
        'Visita a un centro de tallado de diamantes y tarde libre. ' +
        'Opcional: Marken y Volendam, incluida en Experiencias. ' +
        'Alojamiento: Ibis Amsterdam City West.'
    },
    {
      key: 'dia-09-amsterdam-colonia-rin-frankfurt',
      date: '2026-08-12',
      title: 'Día 9 · Ámsterdam → Colonia → Rin → Frankfurt',
      description:
        'Desayuno y salida hacia Colonia, con parada para conocer la ciudad y su catedral. ' +
        'Crucero incluido por el río Rin, con vistas a la Roca de Loreley, castillos y viñedos. ' +
        'Continuación hacia Frankfurt. Alojamiento: B&B Hotel Frankfurt-Messe 3*.'
    },
    {
      key: 'dia-10-frankfurt-rotemburgo-praga',
      date: '2026-08-13',
      title: 'Día 10 · Frankfurt → Rotemburgo → Praga',
      description:
        'Desayuno y salida hacia Rotemburgo. Recorrido a pie por la ciudad medieval y la Ruta Romántica. ' +
        'Continuación hacia Praga. Sugerencia: cena en el restaurante U Fleků. ' +
        'Alojamiento: Zleep Hotel Praga.'
    },
    {
      key: 'dia-11-praga',
      date: '2026-08-14',
      title: 'Día 11 · Praga',
      description:
        'Desayuno y visita panorámica de Praga por la mañana: Teatro Nacional, Plaza Wenceslao, ' +
        'Ciudad Vieja, reloj astronómico, Iglesia de Nuestra Señora de Týn y Puente de Carlos. ' +
        'Tarde libre. Opcional: Karlovy Vary con almuerzo, incluida en Experiencias. ' +
        'Alojamiento: Zleep Hotel Praga.'
    },
    {
      key: 'dia-12-traslado-praga-viena',
      date: '2026-08-15',
      title: 'Día 12 · Praga → Viena',
      description:
        'Desayuno y continuación hacia Viena. Visita panorámica de la ciudad y tiempo libre. ' +
        'Alojamiento: Hotel Rainers Viena 4*.'
    },
    {
      key: 'dia-13-traslado-viena-venecia',
      date: '2026-08-16',
      title: 'Día 13 · Viena → Venecia',
      description:
        'Desayuno y salida hacia Venecia. Visita panorámica a pie por la Plaza de San Marcos ' +
        'y el Puente de los Suspiros. Visita a una fábrica de cristal. ' +
        'Opcional: paseo en góndola, incluido en Experiencias. ' +
        'Alojamiento: Hotel Base Noventa di Piave 4*.'
    },
    {
      key: 'dia-14-traslado-venecia-florencia',
      date: '2026-08-17',
      title: 'Día 14 · Venecia → Florencia',
      description:
        'Desayuno y continuación hacia Florencia. Visita panorámica por Santa Croce, Signoria, ' +
        'Piazza della Repubblica, Ponte Vecchio y la Catedral de Santa María del Fiore. ' +
        'Alojamiento: Hotel The Gate 4*.'
    },
    {
      key: 'dia-15-florencia-asis-roma',
      date: '2026-08-18',
      title: 'Día 15 · Florencia → Asís → Roma',
      description:
        'Desayuno y salida hacia Roma. Parada en Asís para visitar la Basílica de San Francisco. ' +
        'Llegada a Roma. Alojamiento: Roma Aurelia Antica 4*.'
    },
    {
      key: 'dia-16-roma',
      date: '2026-08-19',
      title: 'Día 16 · Roma',
      description:
        'Desayuno y visita panorámica de Roma, finalizando en la Plaza de San Pedro. ' +
        'Opcional: Museos Vaticanos y Capilla Sixtina, incluida en Experiencias. ' +
        'Opcional por la tarde: recorrido por la Roma Barroca. ' +
        'Alojamiento: Roma Aurelia Antica 4*.'
    },
    {
      key: 'dia-17-roma-napoles-capri',
      date: '2026-08-20',
      title: 'Día 17 · Roma libre / Nápoles y Capri',
      description:
        'Desayuno y día libre en Roma. Opcional: excursión de día completo a Nápoles y Capri ' +
        'con almuerzo incluido. Regreso al hotel de Roma. ' +
        'Alojamiento: Roma Aurelia Antica 4*.'
    },
    {
      key: 'dia-18-roma-pisa-costa-azul',
      date: '2026-08-21',
      title: 'Día 18 · Roma → Pisa → Costa Azul',
      description:
        'Desayuno y salida hacia Pisa. Parada en la Plaza de los Milagros para ver la Catedral, ' +
        'el Baptisterio y la Torre Inclinada. Continuación hacia Niza. ' +
        'Opcional: Mónaco, Montecarlo y su casino. Alojamiento: Moxy Sophia Antipolis.'
    },
    {
      key: 'dia-19-traslado-costa-azul-barcelona',
      date: '2026-08-22',
      title: 'Día 19 · Costa Azul → Barcelona',
      description:
        'Desayuno y salida hacia España a través de la Provenza. Llegada a Barcelona y noche libre. ' +
        'Alojamiento: Front Air Congress Hotel 4*.'
    },
    {
      key: 'dia-20-barcelona-zaragoza-madrid',
      date: '2026-08-23',
      title: 'Día 20 · Barcelona → Zaragoza → Madrid',
      description:
        'Desayuno y breve visita panorámica de Barcelona por la mañana. Salida hacia Zaragoza, ' +
        'con tiempo libre para visitar la Basílica del Pilar y el casco antiguo. ' +
        'Continuación a Madrid. Alojamiento: Puerta de Toledo Hotel 3*.'
    },
    {
      key: 'dia-21-madrid-fin',
      date: '2026-08-24',
      title: 'Día 21 · Madrid / fin del circuito',
      description:
        'Desayuno y traslado incluido desde el hotel al aeropuerto de Madrid-Barajas. ' +
        'Fin del circuito WEU228. Número de emergencia del operador: +34 914 188 665.'
    },
    {
      key: 'vuelo-regreso-ib113',
      date: '2026-08-24',
      title: 'Vuelo IB 113 · Madrid → Santiago',
      startTime: '13:20',
      duration: 860,
      alarm: true,
      description:
        '14h 20m. El horario de la tarea corresponde a la hora local de salida en Madrid. ' +
        'Llegada: 24 de agosto, 21:40, hora local de Santiago (SCL). ' +
        'Clase Economy, tarifa Óptima y equipaje facturado de 23 kg. Reserva: M48TE / D1E45GC1D.'
    }
  ];

  // Subtareas operativas. No tienen hora porque el documento de la agencia no
  // informa horarios diarios; así evitamos inventar una planificación.
  const detailedItinerary = [
    {
      key: 'dia-01-traslado-aeropuerto-hotel',
      date: '2026-08-04',
      title: 'Traslado · Aeropuerto de Madrid → hotel',
      description:
        'Asistencia a la llegada y traslado incluido desde Madrid-Barajas al hotel Puerta de Toledo.'
    },
    {
      key: 'dia-01-tiempo-libre-madrid',
      date: '2026-08-04',
      title: 'Tiempo libre · Madrid',
      description:
        'Resto del día libre después de la llegada y el traslado al hotel.'
    },
    {
      key: 'dia-02-visita-panoramica-madrid',
      date: '2026-08-05',
      title: 'Visita incluida · Panorámica de Madrid',
      description:
        'Recorrido matinal por el Madrid histórico y la zona moderna y cosmopolita.'
    },
    {
      key: 'dia-02-opcional-toledo',
      date: '2026-08-05',
      title: 'Opcional · Excursión a Toledo',
      description:
        'Excursión opcional por la tarde a Toledo, la Ciudad de las Tres Culturas. Incluida en Experiencias.'
    },
    {
      key: 'dia-03-traslado-madrid-san-sebastian',
      date: '2026-08-06',
      title: 'Traslado · Madrid → San Sebastián',
      description:
        'Salida desde Madrid hacia San Sebastián después del desayuno buffet.'
    },
    {
      key: 'dia-03-san-sebastian-burdeos',
      date: '2026-08-06',
      title: 'Visita y traslado · San Sebastián → Burdeos',
      description:
        'Breve panorámica de San Sebastián en bus y continuación hacia Burdeos, Francia.'
    },
    {
      key: 'dia-04-ruta-valle-loira-blois',
      date: '2026-08-07',
      title: 'Ruta · Burdeos → Valle del Loira → Blois',
      description:
        'Salida desde Burdeos y recorrido por el Valle del Loira hasta Blois.'
    },
    {
      key: 'dia-04-blois-paris',
      date: '2026-08-07',
      title: 'Parada en Blois y traslado a París',
      description:
        'Tiempo libre en Blois. Visita opcional a un castillo de la región y continuación hacia París.'
    },
    {
      key: 'dia-05-visita-panoramica-paris',
      date: '2026-08-08',
      title: 'Visita incluida · Panorámica de París',
      description:
        'Recorrido por los lugares emblemáticos de París con parada fotográfica en la Torre Eiffel.'
    },
    {
      key: 'dia-05-opcional-crucero-sena',
      date: '2026-08-08',
      title: 'Opcional · Crucero por el Sena',
      description:
        'Crucero opcional por el río Sena. Actividad incluida en Experiencias.'
    },
    {
      key: 'dia-05-opcional-cabaret',
      date: '2026-08-08',
      title: 'Opcional nocturno · Cabaret parisino',
      description:
        'Espectáculo opcional en un cabaret de París con una copa de champagne.'
    },
    {
      key: 'dia-06-opcional-versalles',
      date: '2026-08-09',
      title: 'Opcional · Palacio de Versalles',
      description:
        'Excursión opcional al Palacio de Versalles durante el día libre en París.'
    },
    {
      key: 'dia-06-opcional-montmartre-barrio-latino',
      date: '2026-08-09',
      title: 'Opcional · Montmartre y Barrio Latino',
      description:
        'Visita opcional por la tarde a Montmartre y el Barrio Latino.'
    },
    {
      key: 'dia-07-paris-brujas',
      date: '2026-08-10',
      title: 'Traslado y tiempo libre · París → Brujas',
      description:
        'Salida hacia Brujas y tiempo libre para recorrer el centro histórico y sus canales.'
    },
    {
      key: 'dia-07-brujas-amsterdam',
      date: '2026-08-10',
      title: 'Traslado · Brujas → Ámsterdam',
      description:
        'Continuación del circuito desde Brujas hasta Ámsterdam.'
    },
    {
      key: 'dia-08-visita-panoramica-amsterdam',
      date: '2026-08-11',
      title: 'Visita incluida · Panorámica de Ámsterdam',
      description:
        'Recorrido matinal por las casas, canales y puentes de Ámsterdam.'
    },
    {
      key: 'dia-08-centro-diamantes',
      date: '2026-08-11',
      title: 'Visita incluida · Centro de tallado de diamantes',
      description:
        'Visita a un centro de tallado de diamantes al finalizar la panorámica.'
    },
    {
      key: 'dia-08-opcional-marken-volendam',
      date: '2026-08-11',
      title: 'Opcional · Marken y Volendam',
      description:
        'Excursión opcional a los pueblos pesqueros de Marken y Volendam. Incluida en Experiencias.'
    },
    {
      key: 'dia-09-parada-colonia',
      date: '2026-08-12',
      title: 'Parada · Colonia y su catedral',
      description:
        'Breve parada en Colonia para conocer la ciudad y su catedral gótica.'
    },
    {
      key: 'dia-09-crucero-rin',
      date: '2026-08-12',
      title: 'Actividad incluida · Crucero por el Rin',
      description:
        'Crucero por el río Rin con vistas a la Roca de Loreley, castillos y viñedos.'
    },
    {
      key: 'dia-09-traslado-frankfurt',
      date: '2026-08-12',
      title: 'Traslado · Rin → Frankfurt',
      description:
        'Desembarque y continuación del circuito hacia Frankfurt.'
    },
    {
      key: 'dia-10-visita-rotemburgo',
      date: '2026-08-13',
      title: 'Visita incluida · Rotemburgo medieval',
      description:
        'Recorrido a pie por las murallas, torres y calles medievales de Rotemburgo.'
    },
    {
      key: 'dia-10-rotemburgo-praga',
      date: '2026-08-13',
      title: 'Traslado · Rotemburgo → Praga',
      description:
        'Continuación hacia Praga. Sugerencia opcional: cena de cocina checa en U Fleků.'
    },
    {
      key: 'dia-11-visita-panoramica-praga',
      date: '2026-08-14',
      title: 'Visita incluida · Panorámica de Praga',
      description:
        'Teatro Nacional, Plaza Wenceslao, Ciudad Vieja, reloj astronómico, Iglesia de Týn y Puente de Carlos.'
    },
    {
      key: 'dia-11-opcional-karlovy-vary',
      date: '2026-08-14',
      title: 'Opcional · Karlovy Vary',
      description:
        'Excursión opcional a Karlovy Vary con almuerzo. Incluida en Experiencias.'
    },
    {
      key: 'dia-12-praga-viena',
      date: '2026-08-15',
      title: 'Traslado · Praga → Viena',
      description:
        'Continuación del circuito desde Praga hacia Viena.'
    },
    {
      key: 'dia-12-visita-panoramica-viena',
      date: '2026-08-15',
      title: 'Visita incluida · Panorámica de Viena',
      description:
        'Recorrido panorámico por los principales monumentos de Viena y tiempo libre.'
    },
    {
      key: 'dia-13-viena-venecia',
      date: '2026-08-16',
      title: 'Traslado · Viena → Venecia',
      description:
        'Salida desde Viena y continuación del circuito hacia Venecia.'
    },
    {
      key: 'dia-13-visita-venecia',
      date: '2026-08-16',
      title: 'Visita incluida · Venecia a pie',
      description:
        'Recorrido por la Plaza de San Marcos y el Puente de los Suspiros.'
    },
    {
      key: 'dia-13-cristal-y-gondola',
      date: '2026-08-16',
      title: 'Cristal veneciano y góndola opcional',
      description:
        'Visita incluida a una fábrica de cristal. Paseo en góndola opcional, incluido en Experiencias.'
    },
    {
      key: 'dia-14-venecia-florencia',
      date: '2026-08-17',
      title: 'Traslado · Venecia → Florencia',
      description:
        'Continuación del circuito desde Venecia hacia Florencia.'
    },
    {
      key: 'dia-14-visita-panoramica-florencia',
      date: '2026-08-17',
      title: 'Visita incluida · Panorámica de Florencia',
      description:
        'Santa Croce, Signoria, Piazza della Repubblica, Ponte Vecchio y Catedral de Santa María del Fiore.'
    },
    {
      key: 'dia-15-parada-asis',
      date: '2026-08-18',
      title: 'Parada · Asís y Basílica de San Francisco',
      description:
        'Breve parada en Asís para visitar la Basílica de San Francisco.'
    },
    {
      key: 'dia-15-asis-roma',
      date: '2026-08-18',
      title: 'Traslado · Asís → Roma',
      description:
        'Continuación del viaje desde Asís hasta Roma.'
    },
    {
      key: 'dia-16-visita-panoramica-roma',
      date: '2026-08-19',
      title: 'Visita incluida · Panorámica de Roma',
      description:
        'Recorrido por los lugares principales de Roma, finalizando en la Plaza de San Pedro.'
    },
    {
      key: 'dia-16-opcional-vaticano',
      date: '2026-08-19',
      title: 'Opcional · Museos Vaticanos y Capilla Sixtina',
      description:
        'Visita opcional a los Museos Vaticanos y la Capilla Sixtina. Incluida en Experiencias.'
    },
    {
      key: 'dia-16-opcional-roma-barroca',
      date: '2026-08-19',
      title: 'Opcional · Roma Barroca',
      description:
        'Recorrido opcional por las fuentes y plazas emblemáticas de la Roma Barroca.'
    },
    {
      key: 'dia-17-tiempo-libre-roma',
      date: '2026-08-20',
      title: 'Tiempo libre · Roma',
      description:
        'Día libre en Roma si no se realiza la excursión opcional.'
    },
    {
      key: 'dia-17-opcional-napoles-capri',
      date: '2026-08-20',
      title: 'Opcional · Nápoles y Capri',
      description:
        'Excursión de día completo a Nápoles y Capri con almuerzo incluido y regreso a Roma.'
    },
    {
      key: 'dia-18-parada-pisa',
      date: '2026-08-21',
      title: 'Parada · Pisa y Plaza de los Milagros',
      description:
        'Visita a la Catedral, el Baptisterio y la Torre Inclinada de Pisa.'
    },
    {
      key: 'dia-18-pisa-costa-azul',
      date: '2026-08-21',
      title: 'Traslado · Pisa → Costa Azul',
      description:
        'Continuación desde Pisa hacia Niza, capital de la Costa Azul.'
    },
    {
      key: 'dia-18-opcional-monaco',
      date: '2026-08-21',
      title: 'Opcional · Mónaco y Montecarlo',
      description:
        'Excursión opcional a Mónaco, Montecarlo y su famoso casino.'
    },
    {
      key: 'dia-19-costa-azul-barcelona',
      date: '2026-08-22',
      title: 'Traslado · Costa Azul → Barcelona',
      description:
        'Salida hacia España a través de la Provenza y llegada a Barcelona.'
    },
    {
      key: 'dia-19-tiempo-libre-barcelona',
      date: '2026-08-22',
      title: 'Tiempo libre nocturno · Barcelona',
      description:
        'Tiempo libre para disfrutar las opciones nocturnas de Barcelona.'
    },
    {
      key: 'dia-20-visita-panoramica-barcelona',
      date: '2026-08-23',
      title: 'Visita incluida · Panorámica de Barcelona',
      description:
        'Breve recorrido matinal por los lugares típicos y pintorescos de Barcelona.'
    },
    {
      key: 'dia-20-parada-zaragoza',
      date: '2026-08-23',
      title: 'Parada · Zaragoza y Basílica del Pilar',
      description:
        'Tiempo libre en Zaragoza para visitar la Basílica del Pilar y recorrer el casco antiguo.'
    },
    {
      key: 'dia-20-zaragoza-madrid',
      date: '2026-08-23',
      title: 'Traslado · Zaragoza → Madrid',
      description:
        'Continuación por la tarde desde Zaragoza hasta Madrid.'
    },
    {
      key: 'dia-21-traslado-hotel-aeropuerto',
      date: '2026-08-24',
      title: 'Traslado incluido · Hotel → Madrid-Barajas',
      description:
        'Traslado incluido desde el hotel al aeropuerto de Madrid-Barajas.'
    },
    {
      key: 'dia-21-fin-circuito',
      date: '2026-08-24',
      title: 'Finalizar circuito WEU228',
      description:
        'Fin del circuito Leyendas de Europa. Número de emergencia del operador: +34 914 188 665.'
    }
  ];

  // Las tareas-resumen diarias no se importan: repetían la misma información que
  // las actividades concretas. Solo conservamos los dos vuelos de ese bloque.
  const flightItinerary = summaryItinerary
    .filter((item) => item.key.indexOf('vuelo-') === 0)
    .map((item) => ({ ...item, tagKey: 'transport' }));

  // Algunas entradas antiguas mezclaban transporte con visitas u opcionales.
  // Se sustituyen por tareas separadas para que cada una tenga una sola función
  // y una etiqueta inequívoca.
  const replacedDetailKeys = new Set([
    'dia-03-san-sebastian-burdeos',
    'dia-04-blois-paris',
    'dia-07-paris-brujas',
    'dia-10-rotemburgo-praga',
    'dia-13-cristal-y-gondola',
    'dia-21-fin-circuito'
  ]);

  const separatedDetails = [
    {
      key: 'dia-03-visita-san-sebastian',
      date: '2026-08-06',
      title: 'Visita incluida · Panorámica de San Sebastián',
      description: 'Breve recorrido de la ciudad en bus.',
      tagKey: 'included'
    },
    {
      key: 'dia-03-traslado-san-sebastian-burdeos',
      date: '2026-08-06',
      title: 'Traslado · San Sebastián → Burdeos',
      description: 'Cruce hacia Francia y llegada a Burdeos.',
      tagKey: 'transport'
    },
    {
      key: 'dia-04-tiempo-libre-blois',
      date: '2026-08-07',
      title: 'Tiempo libre · Blois',
      description: 'Posibilidad de visitar opcionalmente uno de los castillos de la región.',
      tagKey: 'optional'
    },
    {
      key: 'dia-04-traslado-blois-paris',
      date: '2026-08-07',
      title: 'Traslado · Blois → París',
      description: '',
      tagKey: 'transport'
    },
    {
      key: 'dia-07-traslado-paris-brujas',
      date: '2026-08-10',
      title: 'Traslado · París → Brujas',
      description: '',
      tagKey: 'transport'
    },
    {
      key: 'dia-07-tiempo-libre-brujas',
      date: '2026-08-10',
      title: 'Tiempo libre · Brujas',
      description: 'Recorrido libre por el centro histórico y sus canales.',
      tagKey: 'optional'
    },
    {
      key: 'dia-10-traslado-rotemburgo-praga',
      date: '2026-08-13',
      title: 'Traslado · Rotemburgo → Praga',
      description: '',
      tagKey: 'transport'
    },
    {
      key: 'dia-10-opcional-cena-u-fleku',
      date: '2026-08-13',
      title: 'Opcional · Cena en U Fleků',
      description: 'Sugerencia de cena con cocina tradicional checa.',
      tagKey: 'optional'
    },
    {
      key: 'dia-13-visita-fabrica-cristal',
      date: '2026-08-16',
      title: 'Visita incluida · Fábrica de cristal veneciano',
      description: 'Demostración de fabricación del cristal veneciano.',
      tagKey: 'included'
    },
    {
      key: 'dia-13-opcional-gondola',
      date: '2026-08-16',
      title: 'Opcional · Paseo en góndola',
      description: 'Actividad incluida en Experiencias.',
      tagKey: 'optional'
    }
  ];

  const transportDetailKeys = new Set([
    'dia-01-traslado-aeropuerto-hotel',
    'dia-03-traslado-madrid-san-sebastian',
    'dia-04-ruta-valle-loira-blois',
    'dia-07-brujas-amsterdam',
    'dia-09-traslado-frankfurt',
    'dia-12-praga-viena',
    'dia-13-viena-venecia',
    'dia-14-venecia-florencia',
    'dia-15-asis-roma',
    'dia-18-pisa-costa-azul',
    'dia-19-costa-azul-barcelona',
    'dia-20-zaragoza-madrid',
    'dia-21-traslado-hotel-aeropuerto'
  ]);

  const categorizedDetails = detailedItinerary
    .filter((item) => !replacedDetailKeys.has(item.key))
    .map((item) => {
      let tagKey = 'included';
      if (transportDetailKeys.has(item.key)) {
        tagKey = 'transport';
      } else if (
        item.key.indexOf('opcional') !== -1 ||
        item.key.indexOf('tiempo-libre') !== -1
      ) {
        tagKey = 'optional';
      }
      return { ...item, tagKey: tagKey };
    })
    .concat(separatedDetails);

  // Una tarea por estancia, no una por noche: así el hotel aparece una sola vez.
  const lodgingStays = [
    ['2026-08-04', 'Alojamiento · Madrid · Puerta de Toledo Hotel 3*', '2 noches, del 4 al 6 de agosto.'],
    ['2026-08-06', 'Alojamiento · Burdeos · B&B Bègles', '1 noche, del 6 al 7 de agosto.'],
    ['2026-08-07', 'Alojamiento · París · B&B Gennevilliers Asnières 3*', '3 noches, del 7 al 10 de agosto.'],
    ['2026-08-10', 'Alojamiento · Ámsterdam · Ibis Amsterdam City West', '2 noches, del 10 al 12 de agosto.'],
    ['2026-08-12', 'Alojamiento · Frankfurt · B&B Hotel Frankfurt-Messe 3*', '1 noche, del 12 al 13 de agosto.'],
    ['2026-08-13', 'Alojamiento · Praga · Zleep Hotel Praga', '2 noches, del 13 al 15 de agosto.'],
    ['2026-08-15', 'Alojamiento · Viena · Hotel Rainers Viena 4*', '1 noche, del 15 al 16 de agosto.'],
    ['2026-08-16', 'Alojamiento · Venecia · Hotel Base Noventa di Piave 4*', '1 noche, del 16 al 17 de agosto.'],
    ['2026-08-17', 'Alojamiento · Florencia · Hotel The Gate 4*', '1 noche, del 17 al 18 de agosto.'],
    ['2026-08-18', 'Alojamiento · Roma · Roma Aurelia Antica 4*', '3 noches, del 18 al 21 de agosto.'],
    ['2026-08-21', 'Alojamiento · Costa Azul · Moxy Sophia Antipolis', '1 noche, del 21 al 22 de agosto.'],
    ['2026-08-22', 'Alojamiento · Barcelona · Front Air Congress Hotel 4*', '1 noche, del 22 al 23 de agosto.'],
    ['2026-08-23', 'Alojamiento · Madrid (regreso) · Puerta de Toledo Hotel 3*', '1 noche, del 23 al 24 de agosto.']
  ];

  const lodgingItinerary = lodgingStays.map((stay) => ({
    key: 'alojamiento-' + stay[0],
    date: stay[0],
    title: stay[1],
    description: stay[2],
    tagKey: 'lodging'
  }));

  const itinerary = flightItinerary
    .concat(categorizedDetails)
    .concat(lodgingItinerary);

  const normalizeText = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const isValidDate = (value) => {
    if (typeof value !== 'string' || value.length !== 10) return false;
    const parsed = new Date(value + 'T12:00:00');
    return !Number.isNaN(parsed.getTime()) &&
      parsed.getFullYear() === Number(value.slice(0, 4)) &&
      parsed.getMonth() + 1 === Number(value.slice(5, 7)) &&
      parsed.getDate() === Number(value.slice(8, 10));
  };

  const isValidTime = (value) => {
    if (!value) return true;
    if (typeof value !== 'string' || value.length !== 5 || value.charAt(2) !== ':') return false;
    const hour = Number(value.slice(0, 2));
    const minute = Number(value.slice(3, 5));
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 &&
      Number.isInteger(minute) && minute >= 0 && minute <= 59;
  };

  const report = {
    reportVersion: 1,
    importName: IMPORT_NAME,
    importVersion: IMPORT_VERSION,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    phase: 'initializing',
    environment: {
      hostname: location.hostname,
      online: typeof navigator === 'undefined' ? null : navigator.onLine,
      hasSupabaseClient: typeof sb !== 'undefined' && Boolean(sb && sb.auth),
      itineraryItems: itinerary.length,
      firstTaskDate: itinerary[0] ? itinerary[0].date : null,
      lastTaskDate: itinerary[itinerary.length - 1]
        ? itinerary[itinerary.length - 1].date
        : null
    },
    session: {
      authenticated: false,
      userIdSuffix: null
    },
    counts: {
      cloudTasksBefore: null,
      planned: itinerary.length,
      alreadyPresentBefore: null,
      attemptedToCreate: 0,
      verifiedAfter: null,
      missingAfterVerification: null
    },
    tags: [],
    calendarHint: {
      firstTasksAreInWeekStarting: '2026-08-03',
      note: 'Si Planner7 abre la semana 27 de julio–2 de agosto, pulsa una vez la flecha de semana siguiente.'
    },
    steps: [],
    result: null,
    error: null
  };

  const serializeError = (error) => {
    if (!error) return null;
    return {
      name: error.name || null,
      message: error.message || String(error),
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null,
      status: error.status || error.statusCode || null
    };
  };

  const markStep = (phase, details) => {
    report.phase = phase;
    report.steps.push({
      at: new Date().toISOString(),
      phase: phase,
      details: details || null
    });
  };

  const publishReport = (status, result, error, download) => {
    report.status = status;
    report.result = result || null;
    report.error = serializeError(error);
    report.finishedAt = new Date().toISOString();

    const snapshot = JSON.parse(JSON.stringify(report));
    globalThis.PLANNER7_IMPORT_REPORT = snapshot;
    console.group('Informe de diagnóstico · ' + IMPORT_NAME);
    console.log(snapshot);
    console.log('También puedes escribir PLANNER7_IMPORT_REPORT en la consola para volver a verlo.');
    console.groupEnd();

    try {
      localStorage.setItem('planner7_last_import_report', JSON.stringify(snapshot));
    } catch (storageError) {
      console.warn('No se pudo guardar el informe en localStorage:', storageError);
    }

    if (!download) return;
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'planner7-diagnostico-europa-' + stamp + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      console.warn('No se pudo descargar el informe; sigue disponible en PLANNER7_IMPORT_REPORT.', downloadError);
    }
  };

  try {
    markStep('checking-host', { hostname: location.hostname });
    if (location.hostname !== APP_HOST) {
      publishReport(
        'blocked',
        'El script se ejecutó fuera de Planner7.',
        new Error('Host inesperado: ' + location.hostname),
        true
      );
      alert('Abre https://' + APP_HOST + ' e inicia sesión antes de ejecutar este script.');
      return;
    }

    markStep('checking-app-client');
    if (typeof sb === 'undefined' || !sb || !sb.auth) {
      publishReport(
        'blocked',
        'No se encontró el cliente de Supabase de Planner7.',
        new Error('La variable global sb no está disponible.'),
        true
      );
      alert('Planner7 todavía no está listo. Espera a que termine de cargar e inténtalo nuevamente.');
      return;
    }

    markStep('validating-itinerary');
    const duplicateKeys = itinerary
      .map((item) => item.key)
      .filter((key, index, all) => all.indexOf(key) !== index);
    const invalidItems = itinerary.filter((item) =>
      !item.key || !item.title || !isValidDate(item.date) ||
      !isValidTime(item.startTime) || !isValidTime(item.endTime) ||
      !item.tagKey || !TRIP_TAGS[item.tagKey]
    );
    if (duplicateKeys.length || invalidItems.length) {
      throw new Error('El itinerario interno no superó la validación.');
    }

    markStep('reading-session');
    const authResult = await sb.auth.getUser();
    const user = authResult && authResult.data ? authResult.data.user : null;
    if (authResult.error || !user) {
      publishReport(
        'blocked',
        'Planner7 no tiene una sesión autenticada.',
        authResult.error || new Error('No se encontró un usuario autenticado.'),
        true
      );
      alert('No hay una sesión iniciada. Inicia sesión en Planner7 y vuelve a ejecutar el script.');
      return;
    }
    report.session.authenticated = true;
    report.session.userIdSuffix = String(user.id).slice(-6);

    markStep('reading-cloud-data');
    const results = await Promise.all([
      sb.from('tasks')
        .select('id,user_id,data,created_at,updated_at')
        .eq('user_id', user.id),
      sb.from('user_data')
        .select('tags,preferences')
        .eq('user_id', user.id)
        .maybeSingle()
    ]);

    const taskResult = results[0];
    const userDataResult = results[1];
    if (taskResult.error) throw taskResult.error;
    if (userDataResult.error) throw userDataResult.error;

    const currentRows = taskResult.data || [];
    report.counts.cloudTasksBefore = currentRows.length;
    const userData = userDataResult.data || null;
    const currentTags = Array.isArray(userData && userData.tags) ? userData.tags : [];
    const resolvedTagIds = {};
    const updatedTags = currentTags.map((tag) => ({ ...tag }));
    let tagsNeedWrite = false;

    Object.keys(TRIP_TAGS).forEach((tagKey) => {
      const definition = TRIP_TAGS[tagKey];
      const existingIndex = updatedTags.findIndex((tag) =>
        tag && (
          tag.id === definition.id ||
          normalizeText(tag.name) === normalizeText(definition.name)
        )
      );
      const existing = existingIndex === -1 ? null : updatedTags[existingIndex];
      resolvedTagIds[tagKey] = existing ? existing.id : definition.id;

      report.tags.push({
        key: tagKey,
        id: resolvedTagIds[tagKey],
        name: existing ? existing.name : definition.name,
        found: Boolean(existing),
        visibleBefore: existing ? existing.visible !== false : null,
        created: !existing,
        madeVisible: Boolean(existing && existing.visible === false)
      });

      if (!existing) {
        updatedTags.push({ ...definition, visible: true });
        tagsNeedWrite = true;
      } else if (existing.visible === false) {
        updatedTags[existingIndex] = { ...existing, visible: true };
        tagsNeedWrite = true;
      }
    });

    markStep('building-task-list', {
      cloudTasksBefore: currentRows.length,
      categories: report.tags.map((tag) => ({
        name: tag.name,
        found: tag.found,
        visibleBefore: tag.visibleBefore
      }))
    });
    const existingIds = new Set(currentRows.map((row) => row.id));
    const nextPositionByDate = new Map();
    currentRows.forEach((row) => {
      const task = row && row.data;
      if (!task || !task.date) return;
      const position = Number.isFinite(Number(task.position)) ? Number(task.position) : 0;
      const currentMax = nextPositionByDate.get(task.date) || 0;
      nextPositionByDate.set(task.date, Math.max(currentMax, position));
    });

    // La etiqueta ya comunica el tipo de tarea; quitamos ese mismo prefijo del
    // título para no mostrar "Opcional", "Traslado" o "Visita incluida" dos veces.
    const cleanTaskTitle = (title) => String(title || '')
      .replace(/^Visita incluida · /, '')
      .replace(/^Actividad incluida · /, '')
      .replace(/^Opcional nocturno · /, '')
      .replace(/^Opcional · /, '')
      .replace(/^Traslado incluido · /, '')
      .replace(/^Traslado · /, '')
      .replace(/^Ruta · /, '')
      .replace(/^Alojamiento · /, '');

    const allImportTasks = itinerary.map((item) => {
      const id = 'task-' + IMPORT_KEY + '-' + user.id + '-' + item.key;
      const position = (nextPositionByDate.get(item.date) || 0) + 10;
      nextPositionByDate.set(item.date, position);
      return {
        id: id,
        title: cleanTaskTitle(item.title),
        description: item.description || '',
        tagId: resolvedTagIds[item.tagKey],
        date: item.date,
        startTime: item.startTime || '',
        endTime: item.endTime || '',
        duration: Number.isFinite(item.duration) ? item.duration : null,
        recurrence: null,
        alarm: Boolean(item.alarm && item.startTime),
        completed: false,
        position: position,
        _importSource: IMPORT_KEY,
        _importVersion: IMPORT_VERSION,
        _importCategory: item.tagKey
      };
    });

    const tasksToCreate = allImportTasks.filter((task) => !existingIds.has(task.id));
    const alreadyPresent = allImportTasks.length - tasksToCreate.length;
    report.counts.alreadyPresentBefore = alreadyPresent;
    report.counts.attemptedToCreate = tasksToCreate.length;

    console.group('Vista previa · ' + IMPORT_NAME);
    console.table(tasksToCreate.map((task) => ({
      fecha: task.date,
      hora: task.startTime || 'Sin hora',
      tarea: task.title,
      etiqueta: report.tags.find((tag) => tag.id === task.tagId)?.name || task.tagId,
      alarma: task.alarm ? 'Sí' : 'No'
    })));
    console.log('Tareas nuevas:', tasksToCreate.length);
    console.log('Ya existentes y omitidas:', alreadyPresent);
    console.table(report.tags.map((tag) => ({
      etiqueta: tag.name,
      estado: tag.created
        ? 'Se creará'
        : (tag.madeVisible ? 'Se hará visible' : 'Ya disponible')
    })));
    console.groupEnd();

    if (!tasksToCreate.length) {
      const hiddenCategory = report.tags.find((tag) => tag.visibleBefore === false);
      report.counts.verifiedAfter = alreadyPresent;
      report.counts.missingAfterVerification = allImportTasks.length - alreadyPresent;
      markStep('already-present', {
        found: alreadyPresent,
        hiddenCategory: hiddenCategory ? hiddenCategory.name : null
      });
      publishReport(
        'already-present',
        hiddenCategory
          ? 'Las ' + allImportTasks.length + ' tareas existen en Supabase, pero hay una etiqueta oculta.'
          : 'Las ' + allImportTasks.length + ' tareas ya existen en Supabase. Busca la semana que comienza el 3 de agosto.',
        null,
        true
      );
      alert(
        'Las ' + alreadyPresent + ' tareas del itinerario ya existen en Supabase.' +
        LINE_BREAK +
        (hiddenCategory
          ? 'La etiqueta "' + hiddenCategory.name + '" está oculta; actívala en el gestor de etiquetas.'
          : 'La primera está en la semana del 3 de agosto. Pulsa la flecha de semana siguiente para verla.') +
        LINE_BREAK + 'Se descargó un informe de diagnóstico.'
      );
      return;
    }

    const confirmationMessage = [
      'Planner7 creará ' + tasksToCreate.length + ' tareas de "' + IMPORT_NAME + '".',
      alreadyPresent ? alreadyPresent + ' tareas ya existentes serán omitidas.' : '',
      'Clasificación: Transporte, Visitas incluidas, Opcionales y tiempo libre, y Alojamiento.',
      tagsNeedWrite ? 'Se crearán o reactivarán las etiquetas que falten.' : 'Las cuatro etiquetas ya están disponibles.',
      'Los vuelos usan la hora local del aeropuerto de salida; la zona horaria automática del dispositivo debe estar activada.',
      '',
      'No se modificará ni eliminará ninguna tarea existente.',
      '¿Continuar?'
    ].filter(Boolean).join(LINE_BREAK);

    if (!confirm(confirmationMessage)) {
      markStep('cancelled-before-write');
      publishReport('cancelled', 'El usuario canceló antes de escribir datos.', null, false);
      console.info('Importación cancelada. No se realizaron cambios.');
      return;
    }

    markStep('saving-local-backup');
    const backupKey = 'planner7_backup_before_' + IMPORT_KEY + '_' + Date.now();
    try {
      localStorage.setItem(backupKey, JSON.stringify({
        createdAt: new Date().toISOString(),
        reason: 'Respaldo automático anterior a importar ' + IMPORT_NAME,
        tasks: currentRows,
        userData: userData
      }));
      console.log('Respaldo previo guardado en localStorage:', backupKey);
    } catch (backupError) {
      console.warn('No se pudo guardar el respaldo local, pero no se ha escrito nada todavía.', backupError);
      if (!confirm('No fue posible guardar el respaldo local. ¿Deseas importar igualmente?')) {
        markStep('cancelled-after-backup-failure');
        publishReport('cancelled', 'El usuario canceló porque el respaldo local falló.', backupError, true);
        console.info('Importación cancelada. No se realizaron cambios.');
        return;
      }
    }

    if (tagsNeedWrite) {
      markStep('writing-tags', {
        categories: report.tags
          .filter((tag) => tag.created || tag.madeVisible)
          .map((tag) => tag.name)
      });
      const tagWrite = await sb.from('user_data').upsert({
        user_id: user.id,
        tags: updatedTags,
        preferences: userData && userData.preferences ? userData.preferences : {}
      }, { onConflict: 'user_id' });
      if (tagWrite.error) throw tagWrite.error;
    }

    markStep('inserting-tasks', { rows: tasksToCreate.length });
    const rowsToInsert = tasksToCreate.map((task) => ({
      id: task.id,
      user_id: user.id,
      data: task
    }));
    const insertResult = await sb.from('tasks').insert(rowsToInsert);
    if (insertResult.error) throw insertResult.error;

    markStep('verifying-cloud-write', { expected: allImportTasks.length });
    const importIds = allImportTasks.map((task) => task.id);
    const verificationResult = await sb.from('tasks')
      .select('id,data')
      .in('id', importIds)
      .eq('user_id', user.id);
    if (verificationResult.error) throw verificationResult.error;

    const verifiedRows = verificationResult.data || [];
    const verifiedIds = new Set(verifiedRows.map((row) => row.id));
    const missingIds = importIds.filter((id) => !verifiedIds.has(id));
    report.counts.verifiedAfter = verifiedRows.length;
    report.counts.missingAfterVerification = missingIds.length;
    if (missingIds.length) {
      const verificationError = new Error(
        'Supabase no devolvió ' + missingIds.length + ' tareas después de insertarlas.'
      );
      verificationError.code = 'IMPORT_VERIFICATION_FAILED';
      verificationError.details = missingIds.map((id) => id.slice(-40)).join(', ');
      throw verificationError;
    }

    markStep('updating-local-cache');
    try {
      const cacheKey = 'tasks_cache_' + user.id;
      const cachedTasks = currentRows
        .map((row) => row && row.data)
        .filter(Boolean)
        .concat(tasksToCreate);
      localStorage.setItem(cacheKey, JSON.stringify(cachedTasks));
      localStorage.setItem('tasks_pending_sync_' + user.id, 'false');
    } catch (cacheError) {
      console.warn('Las tareas se guardaron en la nube, pero no se pudo actualizar la caché local.', cacheError);
    }

    markStep('completed', {
      created: tasksToCreate.length,
      verifiedInCloud: verifiedRows.length,
      alreadyPresent: alreadyPresent
    });
    publishReport(
      'success',
      'Las ' + allImportTasks.length + ' tareas fueron verificadas en Supabase. La primera está en la semana del 3 de agosto.',
      null,
      true
    );
    console.log('%cImportación completada', 'color:#30c55f;font-weight:bold');
    console.log('Tareas creadas:', tasksToCreate.length);
    console.log('Tareas omitidas por existir:', alreadyPresent);
    alert(
      'Importación completada.' + LINE_BREAK +
      'Tareas creadas: ' + tasksToCreate.length + '.' + LINE_BREAK +
      'Tareas verificadas en Supabase: ' + verifiedRows.length + '.' + LINE_BREAK +
      'Se descargó un informe de diagnóstico.' + LINE_BREAK +
      'Tras recargar, ve a la semana del 3 de agosto.'
    );
    location.reload();
  } catch (error) {
    const failedPhase = report.phase;
    markStep('failed', { failedPhase: failedPhase });
    publishReport('failed', 'La importación falló durante la fase "' + failedPhase + '".', error, true);
    console.error('Error importando el itinerario:', error);
    alert(
      'No se pudo completar la importación. No se eliminó ninguna tarea.' +
      LINE_BREAK + 'Fase: ' + failedPhase + '.' +
      LINE_BREAK + 'Detalle: ' + (error && error.message ? error.message : String(error)) +
      LINE_BREAK + 'Se intentó descargar un informe de diagnóstico.'
    );
  }
})();
