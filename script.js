// API urls and key
const GEOLOCATION_API = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_API = 'https://api.weatherapi.com/v1/forecast.json';
const WEATHERAPI_KEY = '5259679ab0e94fab9bc191150241910';

const cityForm = document.querySelector('#cityForm');
const locationBtn = document.querySelector('#locationBtn');
const unitSelector = document.querySelector('#unit');

let temperatureChart;

// Event Listeners
cityForm.addEventListener('submit', handleCityFormSubmit);
locationBtn.addEventListener('click', handleLocationButtonClick);
unitSelector.addEventListener('change', () => {
    if (cityForm.querySelector('#city').value) {
        handleCityFormSubmit({ preventDefault: () => {} }); 
    }
});

async function handleCityFormSubmit(event) {
    event.preventDefault();
    clearContent();

    const cityInput = cityForm.querySelector('#city'); //we get the city input
    const cityName = cityInput.value.trim();//we remove any extra spaces from it

    try {
        const cityCoordinates = await fetchCityCoordinates(cityName); // we fetch the coordinates for the city
        const weatherData = await fetchWeatherData(cityCoordinates.lat, cityCoordinates.long); //fetch the weather data from the 1st API (FORECAST_API)
        await fetchHourlyWeatherData(cityCoordinates.lat, cityCoordinates.long); //fetch the hourly temperature from the 2nd API (WEATHER_API)

        const hourlyData = await fetchAndPrepareHourlyData(cityCoordinates.lat, cityCoordinates.long); //hourlyData is used the graph construction
        renderTemperatureGraph(hourlyData); //we create the raph
        displayWeather(cityName, weatherData); //we  create the pannels with the weather information
        cityInput.value = ''; //the input is cleared
    } catch (error) {
        showError(`Error: ${error}`);
    }
}

function handleLocationButtonClick() {
    clearContent();

    if (navigator.geolocation) { //we use the geolocation
        navigator.geolocation.getCurrentPosition(async (position) => {
            try { //and extract the same information as in the function above
                const weatherData = await fetchWeatherData(position.coords.latitude, position.coords.longitude);
                const hourlyData = await fetchAndPrepareHourlyData(position.coords.latitude, position.coords.longitude);
                renderTemperatureGraph(hourlyData);
                displayWeather('Your location', weatherData);
            } catch (error) {
                showError(`Error: ${error}`);
            }
        });
    } else {
        showError('Geolocation API not available');
    }
}

// make an API request for the current location and parse the JSON response
async function fetchCityCoordinates(cityName) {
    const response = await fetch(`${GEOLOCATION_API}?name=${cityName}&count=1`);
    const data = await response.json();
    return data?.results?.[0] ? { lat: data.results[0].latitude, long: data.results[0].longitude } : null; //return the found coordinates or null
}

//make the API request and parse the response for the 1st API
async function fetchWeatherData(lat, long) {
    const response = await fetch(`${FORECAST_API}?latitude=${lat}&longitude=${long}&timezone=auto&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`);
    return await response.json();
}

//make the API request and parse the response for the 2st API
async function fetchHourlyWeatherData(lat, long) {
    const response = await fetch(`${WEATHER_API}?key=${WEATHERAPI_KEY}&q=${lat},${long}&hourly=temperature_2m`);
    const data = await response.json();
    const hourlyData = data.forecast.forecastday[0].hour.map(hour => hour.temp_c); //we extract the temperature for each hour and return it
    return hourlyData;
}

//we fetch the data for the graph
async function fetchAndPrepareHourlyData(lat, long) {
    const weatherData = await fetchWeatherData(lat, long);
    const hourlyWeatherData = await fetchHourlyWeatherData(lat, long);
    const labels = hourlyWeatherData.map((_, index) => {  //we create labels for each hour, calculate the time for each hour and return it
        const date = new Date(Date.now() + index * 60 * 60 * 1000); 
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });
    //return the labels and info for the graph
    return {
        labels,
        weatherAPITemps: hourlyWeatherData,
        forecastAPITemps: weatherData.hourly.temperature_2m 
    };
}
//using Chart.js we render the graph
function renderTemperatureGraph(data) {
    const ctx = document.getElementById('temperatureGraph').getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    //if there is a char already existing, it gets destroyed and afterwards replaced
    //for example, if you already searched for a location, and now you are searching for the second one, the first chart will be destroyed and replaced with the one for the current location
    if (temperatureChart) {
        temperatureChart.destroy(); 
    }
    temperatureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Forecast API',
                    data: data.forecastAPITemps,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    fill: false,
                },
                {
                    label: 'WeatherAPI',
                    data: data.weatherAPITemps,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    fill: false,
                }
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time',
                    },
                },
                y: {
                    title: {
                        display: true,
                        text: 'Temperature (°C)',
                    },
                    beginAtZero: false,
                },
            },
            plugins: {
                legend: {
                    display: true,
                },
            },
        },
    });
}
//function to parse the weather data to get current, forecast and hourly information
function parseWeatherData(data) {
    const currentWeather = {};
    const forecasts = [];
    const hourlyForecasts = [];
    const currentDatetime = new Date();

    data.hourly.time.forEach((time, index) => {
        const itemDatetime = new Date(time);
        const isToday = currentDatetime.toDateString() === itemDatetime.toDateString();
        const isCurrentHour = currentDatetime.getHours() === itemDatetime.getHours();

        if (isToday && isCurrentHour) {
            currentWeather.date = time;
            currentWeather.temp = data.hourly.temperature_2m[index];
            currentWeather.wind = data.hourly.wind_speed_10m[index];
            currentWeather.humidity = data.hourly.relative_humidity_2m[index];
            currentWeather.code = data.hourly.weather_code[index];
        } else if (isCurrentHour) {
            forecasts.push({
                date: time,
                temp: data.hourly.temperature_2m[index],
                wind: data.hourly.wind_speed_10m[index],
                humidity: data.hourly.relative_humidity_2m[index],
                code: data.hourly.weather_code[index],
            });
        }
        
        if (itemDatetime >= currentDatetime && itemDatetime <= new Date(currentDatetime.getTime() + 24 * 60 * 60 * 1000)) {
            hourlyForecasts.push({
                date: time,
                temp: data.hourly.temperature_2m[index],
                wind: data.hourly.wind_speed_10m[index],
                humidity: data.hourly.relative_humidity_2m[index],
                code: data.hourly.weather_code[index],
            });
        }
    });

    return { current: currentWeather, forecasts, hourly: hourlyForecasts };
}

async function displayWeather(cityName, weather) {
    const pageContent = document.querySelector('.page-content');
    const parsedWeather = parseWeatherData(weather);
    //display the pannel for today, the next 24hours and the next days
    pageContent.append(createWeatherSection(cityName, parsedWeather.current, true));
    pageContent.append(createHourlyForecastSection(parsedWeather.hourly));
    pageContent.append(createWeatherSection(cityName, parsedWeather.forecasts, false));

}
//panel for displaying hourly forecasts
function createHourlyForecastSection(hourlyForecasts) {
    const section = document.createElement('div'); //we create here a new section element, which is the title, and we tell what text will it have
    const title = document.createElement('h2');
    title.classList.add('section-title');
    title.innerText = 'Hourly Forecast for the Next 24 Hours';
    section.append(title);
    const itemsContainer = document.createElement('div');//create a container for the weather items which will show the hourly based weather
    itemsContainer.classList.add('weather-items');
    //go through each hourly forecast to create a weather panel
    hourlyForecasts.forEach(forecast => {
        const forecastPanel = createWeatherPanel(forecast, false);
        itemsContainer.append(forecastPanel);
    });
    section.append(itemsContainer);
    return section;
}
//panel for displaying the current weather or forecast
function createWeatherSection(cityName, weatherData, isCurrent) {
    const section = document.createElement('div');//we create here a new section element
    const title = document.createElement('h2');
    title.classList.add('section-title');
    title.innerText = isCurrent ? `${cityName} Today` : `${cityName} Weather Forecast`;
    section.append(title);
    //pick the appropriate weather panel based on whether it’s current weather or a forecast
    const weatherPanel = isCurrent ? createWeatherPanel(weatherData, true) : createForecastPanel(weatherData);
    section.append(weatherPanel);
    return section;
}

//creating the weather panel to display current or forecast weather information
function createWeatherPanel(weather, isToday) {
    const panel = document.createElement('div');
    panel.classList.add('weather-panel', isToday ? 'today' : 'forecast');
    const weatherCondition = getWeatherCondition(weather.code, weather.date);
    console.log("Weather condition:", weatherCondition);
    panel.classList.add(weatherCondition);  
    const details = document.createElement('div');
    details.classList.add('weather-details');
    panel.append(details);
    const icon = document.createElement('img');
    icon.src = getWeatherIcon(weather.code, weather.date);
    panel.append(icon);
    const selectedUnit = document.querySelector('#unit').value;
    const temp = convertTemperature(weather.temp, selectedUnit);
    details.append(createWeatherDetail('Date', weather.date.replace('T', ', ')));
    details.append(createWeatherDetail('Temperature', `${temp.toFixed(2)}°${selectedUnit}`));
    details.append(createWeatherDetail('Wind', `${weather.wind} km/h`));
    details.append(createWeatherDetail('Humidity', `${weather.humidity} %`));

    return panel;
}

//panel for showing a forecast panel, so one that consists of other weather panels
function createForecastPanel(forecasts) {
    const itemsContainer = document.createElement('div');//create the container
    itemsContainer.classList.add('weather-items');
    forecasts.forEach(forecast => { //go through all the forecasts and create a weather panel for each of them, appending them to the container
        const forecastPanel = createWeatherPanel(forecast, false);
        itemsContainer.append(forecastPanel);
    });

    return itemsContainer;
}
//creating the element to display a specific piece of information
function createWeatherDetail(label, value) {
    const detail = document.createElement('p');
    detail.innerText = `${label}: ${value}`;

    return detail;
}

//get the icon based on what is the weather
function getWeatherIcon(code, dateString) {
    const date = new Date(dateString);
    const hour = date.getHours();
    const isNight = hour < 6 || hour > 21;
    const icons = {
        0: 'weather-icons/sunny.svg',
        1: 'weather-icons/cloudy-day.svg',
        2: 'weather-icons/cloudy-day.svg',
        3: 'weather-icons/cloudy-day.svg',
        45: 'weather-icons/cloudy.svg',
        48: 'weather-icons/cloudy.svg',
        51: 'weather-icons/rainy.svg',
        63: 'weather-icons/rainy.svg',
        71: 'weather-icons/snowy.svg',
        95: 'weather-icons/thunder.svg',
    };

    let iconPath = icons[code] || 'weather-icons/sunny.svg'; 
    
    if (isNight) {
        return 'weather-icons/night.svg';
    }

    return iconPath
}
//get a condition so the background of the panel for today changes based on it
function getWeatherCondition(code, dateString) {
    const date = new Date(dateString);
    const hour = date.getHours();
    const isNight = hour < 6 || hour > 21;

    const conditionMap = {
        0: 'sunny',
        1: 'cloudy',
        2: 'cloudy',
        3: 'cloudy',
        45: 'cloudy',
        48: 'cloudy',
        51: 'rainy',
        63: 'rainy',
        71: 'snowy',
        95: 'storm',
    };

    let condition = conditionMap[code] || 'sunny';  
    if (isNight) {
        condition = 'night';
    }

    return condition;
}

//calculates and returns for the switch between the temperature units
function convertTemperature(temp, unit) {
    switch (unit) {
        case 'F':
            return (temp * 9/5) + 32; 
        case 'K':
            return temp + 273.15;
        default:
            return temp; 
    }
}
//clear the weather container
function clearContent() {
    const pageContent = document.querySelector('.page-content');
    pageContent.innerHTML = '';
}
//show the error on the page
function showError(message) {
    const pageContent = document.querySelector('.page-content');
    const alert = document.createElement('div');
    alert.classList.add('alert-error');
    alert.innerText = message;
    pageContent.append(alert);
}
