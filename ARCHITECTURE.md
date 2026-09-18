# API météo — Architecture et Inversify

## 1. Objectif

L’API expose :

```text
GET /weather?address=<adresse>
```

Le traitement enchaîne deux services externes :

1. **Nominatim** transforme l’adresse en coordonnées ;
2. **Open-Meteo** transforme ces coordonnées en prévisions sur sept jours.

## 2. Structure

```text
src/
├── tokens.ts        # Identifiants de services Inversify
├── container.ts     # Déclaration des bindings
├── weather.ts       # Types, interfaces et service métier
├── nominatim.ts     # Adaptateur Nominatim
├── open-meteo.ts    # Adaptateur Open-Meteo
├── app.ts           # Routes et erreurs HTTP
└── main.ts          # Démarrage de l’API
```

| Fichier | Responsabilité |
| --- | --- |
| `tokens.ts` | Donne un identifiant d’exécution aux interfaces TypeScript. |
| `container.ts` | Associe les identifiants aux implémentations concrètes. |
| `weather.ts` | Définit `Geocoder`, `WeatherProvider`, `WeatherQuery` et `WeatherService`. |
| `nominatim.ts` | Implémente `Geocoder` avec Nominatim. |
| `open-meteo.ts` | Implémente `WeatherProvider` avec Open-Meteo. |
| `app.ts` | Connecte `WeatherQuery` à Fastify. |
| `main.ts` | Récupère le service depuis le conteneur et démarre le serveur. |

## 3. Pourquoi `tokens.ts` est nécessaire

Les interfaces TypeScript sont supprimées à la compilation. Elles n’existent donc plus lorsque le conteneur exécute le JavaScript.

`tokens.ts` crée des symboles qui existent à l’exécution :

```ts
export const TYPES = {
  NominatimConfig: Symbol.for('NominatimConfig'),
  Geocoder: Symbol.for('Geocoder'),
  WeatherProvider: Symbol.for('WeatherProvider'),
  WeatherQuery: Symbol.for('WeatherQuery'),
} as const;
```

Ils permettent à Inversify de distinguer les services demandés :

- `TYPES.Geocoder` représente l’interface `Geocoder` ;
- `TYPES.WeatherProvider` représente `WeatherProvider` ;
- `TYPES.WeatherQuery` représente `WeatherQuery` ;
- `TYPES.NominatimConfig` représente la configuration du géocodeur.

## 4. Décorateurs Inversify

Les classes résolues par le conteneur sont marquées avec `@injectable()`.

Dans `WeatherService`, `@inject` indique quels identifiants le conteneur doit résoudre pour appeler le constructeur :

```ts
@injectable()
export class WeatherService implements WeatherQuery {
  constructor(
    @inject(TYPES.Geocoder) private readonly geocoder: Geocoder,
    @inject(TYPES.WeatherProvider) private readonly weatherProvider: WeatherProvider,
  ) {}
}
```

Inversify sait donc que construire `WeatherService` demande :

1. le service associé à `TYPES.Geocoder` ;
2. le service associé à `TYPES.WeatherProvider`.

`NominatimGeocoder` utilise le même mécanisme pour recevoir sa configuration :

```ts
@injectable()
export class NominatimGeocoder implements Geocoder {
  constructor(@inject(TYPES.NominatimConfig) config: NominatimConfig) {}
}
```

`OpenMeteoWeatherProvider` est aussi `@injectable()`, même s’il n’a pas de dépendance à injecter.

TypeScript est configuré avec :

```json
"experimentalDecorators": true,
"emitDecoratorMetadata": true
```

Ces options permettent de compiler les décorateurs et les métadonnées utilisées par Inversify.

## 5. Les bindings dans `container.ts`

Un **binding** associe un identifiant de service à une implémentation :

```ts
container.bind<NominatimConfig>(TYPES.NominatimConfig).toConstantValue(config);
container.bind<Geocoder>(TYPES.Geocoder).to(NominatimGeocoder).inSingletonScope();
container.bind<WeatherProvider>(TYPES.WeatherProvider).to(OpenMeteoWeatherProvider).inSingletonScope();
container.bind<WeatherQuery>(TYPES.WeatherQuery).to(WeatherService).inSingletonScope();
```

Le conteneur sait donc que :

- demander `Geocoder` doit produire un `NominatimGeocoder` ;
- demander `WeatherProvider` doit produire un `OpenMeteoWeatherProvider` ;
- demander `WeatherQuery` doit produire un `WeatherService` ;
- demander `NominatimConfig` doit retourner l’objet de configuration fourni.

### Signification de `.inSingletonScope()`

Avec un scope singleton, le conteneur crée une instance la première fois, la conserve, puis retourne la même instance aux résolutions suivantes.

C’est important pour `NominatimGeocoder` : son cache et son intervalle minimal entre requêtes doivent être partagés par toutes les utilisations du service.

`toConstantValue` stocke directement la valeur de configuration dans le conteneur.

## 6. Résolution automatique au démarrage

`main.ts` ne contient plus les instanciations manuelles des fournisseurs :

```ts
const container = createContainer();
const weatherService = container.get<WeatherQuery>(TYPES.WeatherQuery);
const app = buildApp(weatherService, true);
```

Lorsque `container.get(TYPES.WeatherQuery)` est appelé, Inversify exécute ces étapes :

1. il trouve le binding `WeatherQuery → WeatherService` ;
2. il lit les métadonnées du constructeur de `WeatherService` ;
3. il découvre les dépendances `Geocoder` et `WeatherProvider` ;
4. il trouve leurs bindings vers `NominatimGeocoder` et `OpenMeteoWeatherProvider` ;
5. pour `NominatimGeocoder`, il résout aussi `NominatimConfig` ;
6. il construit les objets dans le bon ordre ;
7. il retourne l’instance `WeatherService`, typée comme `WeatherQuery`.

Le graphe résolu est :

```text
NominatimConfig ──> NominatimGeocoder ──┐
                                        ├──> WeatherService ──> buildApp
               OpenMeteoWeatherProvider ┘
```

## 7. Où sont le faible couplage et l’IoC ?

### Faible couplage

`WeatherService` utilise les interfaces `Geocoder` et `WeatherProvider`. Il ne sait pas que les implémentations réelles sont Nominatim et Open-Meteo.

`app.ts` utilise `WeatherQuery`. Il ne connaît pas `WeatherService`.

Seul `container.ts` connaît les correspondances interface → implémentation.

### Inversion de contrôle

Les classes métier ne choisissent plus leurs implémentations et ne construisent plus leurs dépendances :

- le conteneur contrôle la création et la résolution ;
- `container.ts` contrôle les bindings ;
- Fastify contrôle le déclenchement des handlers HTTP.

### Injection de dépendances

L’injection se fait automatiquement dans les constructeurs grâce à :

- `@injectable()` pour rendre une classe constructible par le conteneur ;
- `@inject(TYPES...)` pour identifier chaque dépendance ;
- `container.bind(...)` pour choisir l’implémentation ;
- `container.get(...)` pour demander le service racine.

## 8. Tests avec le conteneur

Les tests unitaires créent leur propre `Container`, puis remplacent les implémentations par des stubs :

```ts
container.bind<Geocoder>(TYPES.Geocoder).toConstantValue(geocoderStub);
container.bind<WeatherProvider>(TYPES.WeatherProvider).toConstantValue(providerStub);
container.bind<WeatherQuery>(TYPES.WeatherQuery).to(WeatherService);

const service = container.get<WeatherQuery>(TYPES.WeatherQuery);
```

Inversify construit alors le vrai `WeatherService`, mais avec les fausses dépendances. Aucun appel réseau n’est nécessaire.

Cette méthode deviendra particulièrement utile avec plus de services : les tests pourront remplacer uniquement les bindings nécessaires.

## 9. Ajouter un nouveau service

Pour ajouter un futur service :

1. définir son interface dans `weather.ts` ou un nouveau fichier de contrats ;
2. ajouter un symbole dans `TYPES` ;
3. marquer la classe concrète avec `@injectable()` ;
4. décorer ses paramètres de constructeur avec `@inject(TYPES...)` ;
5. ajouter son binding dans `container.ts`.

Exemple :

```ts
container.bind<WeatherAlertProvider>(TYPES.WeatherAlertProvider)
  .to(OpenWeatherAlertProvider)
  .inSingletonScope();
```

Le conteneur pourra ensuite l’injecter dans les services qui le demandent.

## 10. Règle à conserver

Le conteneur ne doit pas être passé aux classes métier. Elles doivent continuer à déclarer leurs dépendances dans leurs constructeurs.

`container.ts` et `main.ts` sont les seuls endroits qui parlent au conteneur. Cela évite le modèle « Service Locator » et conserve des dépendances explicites et testables.
