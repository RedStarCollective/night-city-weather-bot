const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// File to store ongoing weather events
const EVENTS_FILE = path.join(__dirname, 'ongoing_events.json');

// File to store Ash-Block mode state
const ASHBLOCK_FILE = path.join(__dirname, 'ashblock_enabled.json');

// Load Ash-Block mode state
function loadAshBlockState() {
    try {
        if (fs.existsSync(ASHBLOCK_FILE)) {
            const data = fs.readFileSync(ASHBLOCK_FILE, 'utf8');
            return JSON.parse(data).enabled || false;
        }
    } catch (error) {
        console.log('Error loading Ash-Block state:', error);
    }
    return false;
}

// Save Ash-Block mode state
function saveAshBlockState(enabled) {
    try {
        fs.writeFileSync(ASHBLOCK_FILE, JSON.stringify({ enabled }, null, 2));
    } catch (error) {
        console.log('Error saving Ash-Block state:', error);
    }
}

// Check if Ash-Block mode is active
function isAshBlockActive() {
    return loadAshBlockState();
}

// Load ongoing events from file
function loadOngoingEvents() {
    try {
        if (fs.existsSync(EVENTS_FILE)) {
            const data = fs.readFileSync(EVENTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('Error loading ongoing events:', error);
    }
    return [];
}

// Save ongoing events to file
function saveOngoingEvents(events) {
    try {
        fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
    } catch (error) {
        console.log('Error saving ongoing events:', error);
    }
}

// Add new ongoing event
function addOngoingEvent(condition, duration) {
    const events = loadOngoingEvents();
    
    // Parse duration - convert "3 Days" to days, "45 Minutes" to minutes, etc.
    let durationInDays = 0;
    let originalDuration = duration;
    
    if (duration.includes('Days')) {
        durationInDays = parseInt(duration.split(' ')[0]);
    } else if (duration.includes('Hours')) {
        // Convert hours to fraction of days for simplicity, but we'll handle hours specially
        const hours = parseInt(duration.split(' ')[0]);
        if (hours >= 24) {
            durationInDays = Math.ceil(hours / 24);
        } else {
            durationInDays = 1; // Less than 24 hours = expires today
        }
    } else if (duration.includes('Minutes')) {
        durationInDays = 1; // Minutes = expires today
    }
    
    if (durationInDays > 1) { // Only track multi-day events
        events.push({
            condition: condition,
            originalDuration: originalDuration,
            daysRemaining: durationInDays - 1, // -1 because today is day 1
            startDate: new Date().toDateString()
        });
        saveOngoingEvents(events);
    }
}

// Get active ongoing events and update their durations
function getActiveOngoingEvents() {
    const events = loadOngoingEvents();
    const activeEvents = [];
    const updatedEvents = [];
    
    events.forEach(event => {
        if (event.daysRemaining > 0) {
            activeEvents.push({
                ...event,
                daysRemaining: event.daysRemaining
            });
            // Decrement for next day
            updatedEvents.push({
                ...event,
                daysRemaining: event.daysRemaining - 1
            });
        }
        // Events with 0 days remaining are not added back (they expire)
    });
    
    // Save updated events (with decremented days)
    saveOngoingEvents(updatedEvents.filter(e => e.daysRemaining > 0));
    
    return activeEvents;
}

// Weather Tables from Night City Weather DLC
const weatherTables = {
    winter: { // December to February
        temperature: [
            "Cold (Around 35°F/2°C)",
            "Cold (Around 40°F/4°C)", 
            "Cold (Around 40°F/4°C)",
            "Cool (Around 50°F/10°C)",
            "Cool (Around 50°F/10°C)",
            "Cool (Around 60°F/15°C)"
        ],
        conditions: [
            "Clear",
            "Light Rain/Sleet",
            "Overcast", 
            "Overcast",
            "Heavy Rain/Sleet",
            "Strange"
        ]
    },
    spring: { // March to May
        temperature: [
            "Cold (Around 40°F/4°C)",
            "Cool (Around 50°F/10°C)",
            "Cool (Around 50°F/10°C)", 
            "Cool (Around 50°F/10°C)",
            "Warm (Around 60°F/15°C)",
            "Warm (Around 70°F/21°C)"
        ],
        conditions: [
            "Clear",
            "Light Rain",
            "Overcast",
            "Light Rain", 
            "Heavy Rain",
            "Strange"
        ]
    },
    summer: { // June to August
        temperature: [
            "Warm (Around 60°F/15°C)",
            "Warm (Around 70°F/21°C)",
            "Warm (Around 70°F/21°C)",
            "Hot (Around 80°F/27°C)",
            "Hot (Around 80°F/27°C)", 
            "Hot (Around 90°F/32°C)"
        ],
        conditions: [
            "Light Rain",
            "Clear",
            "Overcast",
            "Overcast",
            "Clear",
            "Strange"
        ]
    },
    fall: { // September to November
        temperature: [
            "Cool (Around 40°F/4°C)",
            "Warm (Around 60°F/15°C)",
            "Warm (Around 60°F/15°C)",
            "Warm (Around 60°F/15°C)",
            "Warm (Around 70°F/21°C)",
            "Hot (Around 80°F/27°C)"
        ],
        conditions: [
            "Light Rain/Sleet",
            "Clear", 
            "Overcast",
            "Overcast",
            "Clear",
            "Strange"
        ]
    }
};

const strangeWeather = {
    conditions: [
        "Radioactive Windstorm",
        "Ash Storm",
        "Flooding",
        "Blood Rain",
        "Acid Rain",
        "Deadly Thunderstorm",
        "Inversion Smog",
        "Cold Snap/Heat Wave",
        "Dust Storm",
        "Blackout"
    ],
    durations: [
        "1d6 x 10 Minutes",
        "1d6 x 10 Minutes",
        "1d6 Days",
        "1d6 Hours",
        "1d6 Hours",
        "1d6 x 10 Minutes",
        "1d6 Days",
        "1d6 Days",
        "1d6 x 10 Minutes",
        "1d6 Days"
    ]
};

// Ash-Block Special Event Tables
const ashBlockTables = {
    // Temperature Table (1d10) - shifted to reduce Bitter Cold frequency
    temperature: [
        "Bitter Cold (Around 22°F/-6°C)",  // 1
        "Cold (Around 28°F/-2°C)",          // 2
        "Cold (Around 30°F/-1°C)",          // 3
        "Cool (Around 36°F/2°C)",           // 4
        "Cool (Around 40°F/4°C)",           // 5
        "Cool (Around 42°F/6°C)",           // 6
        "Cool (Around 45°F/7°C)",           // 7
        "Cool (Around 48°F/9°C)",           // 8
        "Mild (Around 52°F/11°C)",          // 9
        "Mild (Around 52°F/11°C)"           // 10
    ],
    // Conditions Table (1d6)
    conditions: [
        "Thick Haze",       // 1
        "Thin Haze",        // 2
        "Light Precipitation", // 3
        "Heavy Precipitation", // 4
        "Driving Snow",     // 5
        "Strange"           // 6
    ]
};

// Ash-Block Strange Weather Table (1d10)
const ashBlockStrangeWeather = {
    conditions: [
        "Flash Freeze",      // 1
        "Soot Swirls",       // 2
        "Blood Slush",       // 3
        "Radioactive Sleet", // 4
        "Acid Snow",         // 5
        "Hail Mary",         // 6
        "Total Eclipse",     // 7
        "Freezing Rain",     // 8
        "The Black Blizzard",// 9
        "Eye of the Storm"   // 10
    ],
    durations: [
        "1d6 Days",          // Flash Freeze
        "1d6 x 2 Hours",     // Soot Swirls
        "1d6 Days",          // Blood Slush
        "1d6 Hours",         // Radioactive Sleet
        "1d6 Hours",         // Acid Snow
        "1d6 x 10 Minutes",  // Hail Mary
        "1d6 x 4 Hours",     // Total Eclipse
        "1d6 Hours",         // Freezing Rain
        "1d6 x 2 Hours",     // The Black Blizzard
        "1d6 + 2 Hours"      // Eye of the Storm
    ]
};

// Get precipitation type based on temperature for Ash-Block
function getPrecipitationType(temperature) {
    if (temperature.includes('Bitter Cold') ||
        temperature.includes('28°F') ||
        temperature.includes('30°F')) {
        return 'Snow or ice pellets';
    } else if (temperature.includes('32°F')) {
        return 'Mix of snow and sleet';
    } else if (temperature.includes('36°F') ||
               temperature.includes('40°F') ||
               temperature.includes('42°F') ||
               temperature.includes('45°F')) {
        return 'Sleet, freezing rain, or wet snow';
    } else if (temperature.includes('48°F') || temperature.includes('Mild')) {
        return 'Cold rain, possibly mixed with sleet';
    }
    return null;
}

// Utility functions
function rollD6() {
    return Math.floor(Math.random() * 6) + 1;
}

function rollD10() {
    return Math.floor(Math.random() * 10) + 1;
}

function getCurrentSeason() {
    const month = new Date().getMonth(); // 0-11
    if (month >= 11 || month <= 1) return 'winter'; // Dec, Jan, Feb
    if (month >= 2 && month <= 4) return 'spring';  // Mar, Apr, May
    if (month >= 5 && month <= 7) return 'summer';  // Jun, Jul, Aug
    return 'fall'; // Sep, Oct, Nov
}

function rollWeather() {
    const ashBlockActive = isAshBlockActive();

    // Ash-Block mode uses special tables
    if (ashBlockActive) {
        return rollAshBlockWeather();
    }

    // Normal seasonal weather
    const season = getCurrentSeason();
    const table = weatherTables[season];

    const tempRoll = rollD6() - 1; // Convert to 0-5 for array index
    const conditionRoll = rollD6() - 1;

    const temperature = table.temperature[tempRoll];
    let condition = table.conditions[conditionRoll];
    let duration = null;

    // Check for strange weather
    if (condition === "Strange") {
        const strangeRoll = rollD10() - 1; // Convert to 0-9 for array index
        const durationRoll = rollD6();

        condition = strangeWeather.conditions[strangeRoll];
        duration = strangeWeather.durations[strangeRoll].replace('1d6', durationRoll.toString());

        // Handle Cold Snap/Heat Wave logic
        if (condition === "Cold Snap/Heat Wave") {
            if (temperature.includes("Cool") || temperature.includes("Cold")) {
                condition = "Cold Snap";
            } else {
                condition = "Heat Wave";
            }
        }

        // Add to ongoing events if duration > 1 day
        addOngoingEvent(condition, duration);
    }

    return { temperature, condition, duration, season, ashBlock: false };
}

// Roll weather using Ash-Block special event tables
function rollAshBlockWeather() {
    const tempRoll = rollD10() - 1; // 1d10 for Ash-Block temperature
    const conditionRoll = rollD6() - 1; // 1d6 for conditions

    const temperature = ashBlockTables.temperature[tempRoll];
    let condition = ashBlockTables.conditions[conditionRoll];
    let duration = null;
    let precipitationType = null;

    // Get precipitation type for precipitation-based conditions
    if (condition === "Light Precipitation" ||
        condition === "Heavy Precipitation" ||
        condition === "Driving Snow") {
        precipitationType = getPrecipitationType(temperature);
    }

    // Check for Ash-Block strange weather
    if (condition === "Strange") {
        const strangeRoll = rollD10() - 1;
        const durationRoll = rollD6();

        condition = ashBlockStrangeWeather.conditions[strangeRoll];
        let durationTemplate = ashBlockStrangeWeather.durations[strangeRoll];

        // Handle "1d6 + 2" format (Eye of the Storm)
        if (durationTemplate.includes('+')) {
            const addValue = parseInt(durationTemplate.match(/\+ (\d+)/)[1]);
            duration = durationTemplate.replace('1d6', (durationRoll + addValue).toString()).replace(' + ' + addValue, '');
        } else {
            duration = durationTemplate.replace('1d6', durationRoll.toString());
        }

        // Add to ongoing events if multi-day
        addOngoingEvent(condition, duration);
    }

    return {
        temperature,
        condition,
        duration,
        season: 'ash-block',
        ashBlock: true,
        precipitationType
    };
}

function createWeatherEmbed(weather) {
    // Get current date and just change the year to 2047
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];

    const dayName = days[now.getDay()]; // Use actual current day of week
    const monthName = months[now.getMonth()];
    const date = now.getDate();
    const year = 2048; // Just set year to 2048

    const formattedDate = `${dayName}, ${monthName} ${date}, ${year}`;

    // Get active ongoing events
    const ongoingEvents = getActiveOngoingEvents();

    // Determine embed color - Ash-Block uses grey-brown, otherwise condition-based
    let embedColor;
    if (weather.ashBlock) {
        // Grey-brown for Ash-Block theme
        embedColor = '#6B5B4F';
    } else if (weather.condition.includes('Blood')) {
        embedColor = '#FF0000';
    } else if (weather.condition.includes('Acid')) {
        embedColor = '#FFFF00';
    } else if (weather.condition.includes('Storm')) {
        embedColor = '#800080';
    } else if (weather.condition.includes('Radioactive')) {
        embedColor = '#00FF00';
    } else {
        embedColor = '#00BFFF';
    }

    const embed = new EmbedBuilder()
        .setTitle('🏙️ NCWR - NIGHT CITY WEATHER REPORT')
        .setColor(embedColor)
        .addFields(
            { name: 'BROADCAST DATE', value: `${formattedDate}`, inline: false },
            { name: '🌡️ TEMPERATURE', value: weather.temperature, inline: true },
            { name: '☁️ CONDITIONS', value: weather.condition, inline: true },
            { name: '\u200b', value: '\u200b', inline: true } // Spacer
        )
        .setFooter({
            text: weather.ashBlock
                ? 'NCWR • Ash-Block Event • Time of the Red'
                : `NCWR • ${weather.season.charAt(0).toUpperCase() + weather.season.slice(1)} • Time of the Red`
        })
        .setTimestamp();

    // Add precipitation type for Ash-Block precipitation conditions
    if (weather.precipitationType) {
        embed.addFields({
            name: '🌨️ PRECIPITATION TYPE',
            value: weather.precipitationType,
            inline: true
        });
    }
    
    if (weather.duration) {
        embed.addFields({ 
            name: '⏱️ DURATION', 
            value: weather.duration, 
            inline: true 
        });
    }
    
    // Add ongoing weather events if any
    if (ongoingEvents.length > 0) {
        const ongoingText = ongoingEvents.map(event => {
            const daysText = event.daysRemaining === 1 ? '1 day' : `${event.daysRemaining} days`;
            return `🔄 **${event.condition}** - ${daysText} remaining`;
        }).join('\n');
        
        embed.addFields({ 
            name: '🔄 CONTINUING FROM PREVIOUS DAYS', 
            value: ongoingText, 
            inline: false 
        });
    }
    
    // Add broadcast-style descriptions ONLY for emergencies
    let broadcastDescription = '';
    
    if (weather.condition.includes('Blood Rain')) {
        broadcastDescription = '🚨 **WEATHER EMERGENCY** • The sky is crying blood! All citizens advised to seek immediate shelter.';
    } else if (weather.condition.includes('Acid Rain')) {
        broadcastDescription = '⚠️ **CORROSION ALERT** • Acidic precipitation detected. Equipment damage likely.';
    } else if (weather.condition.includes('Radioactive')) {
        broadcastDescription = '☢️ **RADIATION WARNING** • Hot Zone particles detected. Radiation suits essential.';
    } else if (weather.condition.includes('Ash Storm')) {
        broadcastDescription = '🌫️ **AIR QUALITY EMERGENCY** • Toxic ash clouds detected. Breathing apparatus required.';
    } else if (weather.condition.includes('Deadly Thunderstorm')) {
        broadcastDescription = '⛈️ **SEVERE WEATHER ALERT** • Dangerous electrical activity. Avoid metallic objects.';
    } else if (weather.condition.includes('Cold Snap')) {
        broadcastDescription = '🧊 **FREEZE WARNING** • Sub-zero temperatures creating hazardous ice conditions.';
    } else if (weather.condition.includes('Heat Wave')) {
        broadcastDescription = '🔥 **HEAT EMERGENCY** • Extreme temperatures pose serious health risks.';
    } else if (weather.condition.includes('Dust Storm')) {
        broadcastDescription = '💨 **VISIBILITY ALERT** • Badlands dust storm approaching. Respiratory protection advised.';
    } else if (weather.condition.includes('Inversion Smog')) {
        broadcastDescription = '🏭 **POLLUTION ADVISORY** • Toxic smog levels critical. Breathing apparatus mandatory.';
    } else if (weather.condition.includes('Flooding')) {
        broadcastDescription = '🌊 **FLOOD WARNING** • Water levels rising. Avoid underground areas.';
    } else if (weather.condition.includes('Blackout')) {
        broadcastDescription = '🔌 **INFRASTRUCTURE FAILURE** • Widespread power outages reported.';
    }
    // Ash-Block Strange Weather broadcast descriptions
    else if (weather.condition === 'Flash Freeze') {
        broadcastDescription = '🧊 **FLASH FREEZE ALERT** • Black ice forming on all surfaces. Exercise extreme caution.';
    } else if (weather.condition === 'Soot Swirls') {
        broadcastDescription = '💨 **VISIBILITY WARNING** • High winds whipping ash-laden snow. Sensors impaired.';
    } else if (weather.condition === 'Blood Slush') {
        broadcastDescription = '🩸 **BIOHAZARD ALERT** • Toxic Blood Rain has frozen into hazardous slush. Avoid contact.';
    } else if (weather.condition === 'Radioactive Sleet') {
        broadcastDescription = '☢️ **RADIATION WARNING** • Hot Zone particulates detected in precipitation. Seek cover immediately.';
    } else if (weather.condition === 'Acid Snow') {
        broadcastDescription = '⚠️ **CORROSION ALERT** • Highly acidic snowfall detected. Equipment and skin damage likely.';
    } else if (weather.condition === 'Hail Mary') {
        broadcastDescription = '⛈️ **SEVERE STORM WARNING** • Large hail and lightning strikes imminent. Seek solid shelter.';
    } else if (weather.condition === 'Total Eclipse') {
        broadcastDescription = '🌑 **DARKNESS ADVISORY** • Smoke layer blocking all sunlight. Temperatures plummeting.';
    } else if (weather.condition === 'Freezing Rain') {
        broadcastDescription = '🌧️ **ICE STORM WARNING** • Freezing rain coating all surfaces. Dangerous conditions.';
    } else if (weather.condition === 'The Black Blizzard') {
        broadcastDescription = '🌫️ **AIR QUALITY EMERGENCY** • Ash blizzard at street level. Breathing apparatus mandatory.';
    } else if (weather.condition === 'Eye of the Storm') {
        broadcastDescription = '✨ **RARE CONDITIONS** • Clean precipitation detected. The ash layer has temporarily cleared.';
    }

    if (broadcastDescription) {
        embed.setDescription(broadcastDescription);
    }
    
    // Temperature mechanical effects
    let mechanicalEffects = [];

    // Ash-Block Bitter Cold (most severe)
    if (weather.temperature.includes('Bitter Cold')) {
        mechanicalEffects.push('🥶 **Bitter Cold Temperature**: Dangerously cold conditions. The rules for Exposure (CP:R page 181) apply - anyone without Cold-Weather Jacket Lining or equivalent protection suffers Exposure damage every 15 minutes outdoors. Surfaces are treacherous with ice.');
    }
    // Ash-Block and standard Cold temperatures
    else if (weather.temperature.includes('Cold (Around 35°F') ||
             weather.temperature.includes('Cold (Around 40°F') ||
             weather.temperature.includes('Cold (Around 28°F') ||
             weather.temperature.includes('Cold (Around 30°F') ||
             weather.temperature.includes('Cold (Around 32°F')) {
        mechanicalEffects.push('❄️ **Cold Temperature**: The temperature is below normal tolerance limits for the average person. Anyone who spends most of the day outside or inside but in non-heated environment without proper protective gear suffers damage via Exposure (CP:R page 181). [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
    }

    if (weather.temperature.includes('Hot (Around')) {
        mechanicalEffects.push('🔥 **Hot Temperature**: The temperature has risen to an uncomfortable degree. Increase any preexisting Armor Penalty to REF, DEX, and MOVE by 1. For example, a -2 penalty becomes a -3 penalty. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
    }

    // Ash-Block base condition effects
    if (weather.condition === 'Thick Haze') {
        mechanicalEffects.push('🌫️ **Thick Haze**: The ash layer presses down heavy on the city. No precipitation, but the grey-brown murk limits visibility. GMs can apply a -1 penalty to Perception checks and ranged attacks beyond 50m/yds.');
    } else if (weather.condition === 'Thin Haze') {
        mechanicalEffects.push('🌁 **Thin Haze**: The ash layer is lighter today - still present, but visibility improves. The sun is a pale smear behind the murk. No mechanical penalties, but the sky remains wrong.');
    } else if (weather.condition === 'Light Precipitation') {
        mechanicalEffects.push('🌨️ **Light Precipitation**: Gentle snowfall or sleet depending on temperature. Surfaces become slick. GMs can apply a -1 penalty to appropriate checks (Athletics, Drive Land Vehicle, etc.). Note: All precipitation during the Ash-Block is tainted by the smoke layer. Snow is grey or brown. Rain leaves residue.');
    } else if (weather.condition === 'Heavy Precipitation') {
        mechanicalEffects.push('❄️ **Heavy Precipitation**: Significant snowfall or sleet. Accumulation is likely. Visibility reduced. GMs can apply a -2 penalty to Perception checks, ranged attacks at distance, and any checks on slick surfaces. Note: All precipitation is tainted - grey or brown snow, residue-leaving rain.');
    } else if (weather.condition === 'Driving Snow') {
        mechanicalEffects.push('🌨️ **Driving Snow**: Near-whiteout conditions. Visibility beyond 10m/yds is severely limited. Treat as Heavy Rain/Sleet penalties (-2) and consider applying movement penalties for snow accumulation. Note: The ash-tainted snow creates grey-brown drifts.');
    }
    
    // Condition mechanical effects
    switch (weather.condition) {
        case 'Acid Rain':
            mechanicalEffects.push('☣️ **Acid Rain**: Almost all rain that falls in Night City is lightly acidic but occasionally a storm brings precipitation so corrosive it can cause damage in a matter of hours instead of years. For each full minute spent in Acid Rain without protection, ablate all worn armor by 1 SP. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Ash Storm':
            mechanicalEffects.push('🌫️ **Ash Storm**: Fires, in both urban areas and in the Badlands, aren\'t uncommon in the Time of the Red. Occasionally, they burn so hot, long, and large that the wind blows the toxic ashes and smoke across Night City. Treat anyone who spends more than one minute in an Ash Storm without Nasal Filters, Anti-Smog Breathing Mask, or a similar device as if they have been exposed to a Vial of Poison (CP:R page 355). They also suffer the Foreign Object Critical Injury as the ash clogs their lungs and sinus passages, though they do not take the initial Bonus Damage. This Critical Injury can\'t be tended to until the patient leaves the Ash Storm. Also GMs can, at their discretion, apply a -2 penalty to any appropriate Skill Check, including Perception Checks to see and ranged attack Checks to hit a target at a distance. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Blood Rain':
            mechanicalEffects.push('🩸 **Blood Rain**: An aftereffect of the 4th Corporate War, Blood Rain is a greasy, pinkish-red form of precipitation known to carry various caustic substances, toxins, and radioactive particles. Roll 1d6. On a 1 to 3, the Blood Rain acts just like Acid Rain, although it smells much worse. On a 4 to 6, once per minute treat anyone exposed to the Blood Rain without protection as if they we dosed with a Vial of Biotoxin (CP:R page 355). Also GMs can, at their discretion, apply a -1 penalty to any appropriate Skill Check, including Perception Checks to see and ranged attack Checks to hit a target at a distance. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Cold Snap':
            mechanicalEffects.push('🧊 **Cold Snap**: The weather has turned incredibly cold, dropping below freezing. This overrides any roll made for Temperature on a Weather table. The rules for Exposure (CP:R page 181) apply. In addition, black ice forms everywhere, making conditions treacherous. GMs can, at their discretion, apply a -2 penalty to any appropriate Skill Check made while on icy surfaces. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Deadly Thunderstorm':
            mechanicalEffects.push('⚡ **Deadly Thunderstorm**: While thunderstorms are rare in Night City, when they happen they trend towards incredibly destructive. Once per ten minute period during the storm, the GM should roll 1d6. On a 1 to 3, the lightning strikes far away. On a 4 to 6, the lighting strikes the tallest nearby structure or natural feature. If there is no such structure or natural feature nearby, it strikes either the tallest Character or the Character holding a two-handed metal weapon. If the Character struck is touching another Character (for example, via a Grapple) they are both struck. Anyone hit by lightning takes 6d6 damage to their body and the lightning strike counts as a flashbang grenade (CP:R page 346) centered on the struck Character. Also GMs can, at their discretion, apply a -2 penalty to any appropriate Skill Check, including Perception Checks to see and ranged attack Checks to hit a target at a distance. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Dust Storm':
            mechanicalEffects.push('💨 **Dust Storm**: Northern California has been in a drought since at least the 2020s, transforming much of the land outside of Night City into desert often known as the Badlands. Strong winds occasionally pick up loose particles of dust and debris from those erosion-prone wastes and blows them into the city proper. Anyone who spends more than five minutes in a Dust Storm without Nasal Filters, Anti-Smog Breathing Mask, or a similar device suffers the Foreign Object Critical Injury as the dust clogs their lungs and sinus passages, though they do not take the initial Bonus Damage. This Critical Injury can\'t be tended to until the patient is removed from the Dust Storm. GMs can, at their discretion, apply a -2 penalty to any appropriate Skill Check, including Perception Checks to see and ranged attack Checks to hit a target at a distance. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Heat Wave':
            mechanicalEffects.push('🔥 **Heat Wave**: Thanks to climate change, more and more often the temperature in Night City spikes into the low 100s and 110s. This overrides any roll made for Temperature on a Weather table. In such oppressive heat, those who wear bulky gear like heavy armors can suffer tremendously. The rules for Exposure (CP:R page 181) apply. Increase any preexisting Armor Penalty to REF, DEX, and MOVE by 2. For example, a -2 penalty becomes a -4 penalty. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Heavy Rain/Sleet':
            mechanicalEffects.push('🌧️ **Heavy Rain/Sleet**: Not only does heavy rain (or sleet in colder weather) make surfaces slick but it also impacts visibility. GMs can, at their discretion, apply a -2 penalty to any appropriate Skill Check, including Perception Checks to see and ranged attack Checks to hit a target at a distance. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Inversion Smog':
            mechanicalEffects.push('☁️ **Inversion Smog**: Despite the switchover from gasoline to CHOOH2, intense smog "as thick as pea soup" remains a problem in Night City due to lax regulations, regular fires, and industrial toxins spilling into the atmosphere. Treat anyone who spends more than one minute in an Inversion Smog without Nasal Filters, Anti-Smog Breathing Mask, or a similar device as if they have been exposed to a Vial of Poison (CP:R page 355). GMs can, at their discretion, apply a -4 penalty to any appropriate Skill Check, including Perception Checks to see and ranged attack Checks to hit a target at a distance. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Light Rain/Sleet':
            mechanicalEffects.push('💧 **Light Rain/Sleet**: A Cyberpunk classic, light rain (or sleet in colder weather) doesn\'t reduce visibility but can make surfaces slick. GMs can, at their discretion, apply a -1 penalty to any appropriate Skill Check such as an Athletics Check to climb a slippery fence or a Drive Land Vehicle Check to perform a maneuver on wet roads. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Radioactive Windstorm':
            mechanicalEffects.push('☢️ **Radioactive Windstorm**: Good news? The Hot Zone isn\'t as radioactive as it used to be. Bad news? The Hot Zone is still somewhat radioactive and strong winds occasionally blow radioactive particles into other parts of Night City. Anyone exposed to the Radioactive Winds who is not protected by a Radiation Suit or similar item is treated as if they are exposed to high level radiation (CP:R page 181). Radioactive wind burst begin at the GM\'s discretion and last for 1d6 Rounds. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Flooding':
            mechanicalEffects.push('🌊 **Flooding**: The nuclear blast that destroyed the Arasaka Tower back in 2022 also destabilized the fill much of Night City is built on. Repairs have been made over the years but, occasionally, ocean water seeps up through the cracks and floods a section of the city. At street level, the water levels rarely rise to above more than a few inches, making it more a nuisance than a real problem. Below ground, the flooding can fill basements and tunnels. Wading through a deeply flooded area uses the rules for an "other form of movement" (CP:R page 169). [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;
            
        case 'Blackout':
            mechanicalEffects.push('⚡ **Blackout**: While not an actual weather condition, loss of power, CitiNet access, and communications often happens due to extreme meteorological activity. The GM can determine where the outage is (1d10 blocks or neighborhood zones centered on the crew\'s current location, if determining randomly). For the duration of the outage, any building in the area without a generator won\'t have electricity and Agents won\'t be able to make calls or connect to the Data Pool. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
            break;

        // Ash-Block Strange Weather
        case 'Flash Freeze':
            mechanicalEffects.push('🧊 **Flash Freeze**: The haze briefly cleared and the sun melted the slush. Then the smoke layer thickened, plunging the city back into a Cold Snap. Every outdoor surface is now covered in black ice. GMs can apply a -2 penalty to any appropriate Skill Check made while on icy surfaces, including Athletics Checks to maintain footing and Drive Land Vehicle Checks to maneuver. The rules for Exposure (CP:R page 181) apply until the ice melts. At Cool or Mild temperatures, the ice begins to thaw - but will refreeze overnight, extending the hazard.');
            break;

        case 'Soot Swirls':
            mechanicalEffects.push('💨 **Soot Swirls**: High winds whip up the grey, ash-laden snowdrifts, stinging eyes and coating sensors. Visibility is reduced by the swirling grit. GMs can apply a -2 penalty to any appropriate Skill Check, including Perception Checks to see and ranged attack Checks to hit a target more than 4 m/yds away. Characters with UV/IR negate this penalty.');
            break;

        case 'Blood Slush':
            mechanicalEffects.push('🩸 **Blood Slush**: The "Blood Rain" coming in off the Pacific has frozen into pinkish, greasy drifts on windward walls and in sheltered corners. The slush persists until temperatures rise significantly. Anyone who handles or wades through the Blood Slush for longer than one minute without a Waterproof Jacket Lining or other protection is treated as if exposed to Blood Rain. Roll 1d6: on a 1-3, the Blood Slush acts like Acid Rain, ablating 1 SP from worn armor per minute of exposure. On a 4-6, treat the character as if dosed with a Vial of Biotoxin (CP:R page 355) once per minute of exposure. Packed Blood Slush can be thrown as a snowball (Thrown Poisoned Light Melee Weapon).');
            break;

        case 'Radioactive Sleet':
            mechanicalEffects.push('☢️ **Radioactive Sleet**: Radioactive particulates from the Hot Zone have mixed with heavy sleet and are raining down on the city. Anyone without an umbrella or other overhead cover has their clothes saturated after 1 minute of exposure. They are treated as exposed to Low Level Radiation (CP:R page 181) until they can get dry. A Waterproof Jacket Lining extends this safe time to 5 minutes and allows the sleet to be shaken off as an Action once out of the precipitation. Characters in Radiation Suits or sealed armor are immune.');
            break;

        case 'Acid Snow':
            mechanicalEffects.push('☣️ **Acid Snow**: The smoke layer has turned today\'s precipitation highly corrosive. The city is covered in dirty grey-black snow that burns exposed skin and eats through fabric. For each full minute spent in Acid Snow without protection, ablate all worn armor by 1 SP. Waterproof Jacket Linings and umbrellas provide protection as they would against Acid Rain. Packed Acid Snow can be thrown as a snowball - treat as a Thrown Weapon attack that ablates 1 SP from the target\'s armor on a successful hit.');
            break;

        case 'Hail Mary':
            mechanicalEffects.push('⛈️ **Hail Mary**: A Deadly Thunderstorm rolls through, dropping quarter-to-baseball-sized hail in sporadic clusters. Once the storm begins, anyone outdoors without a deployed Militech Tactical Umbrella or solid overhead cover has a 1-in-6 chance per minute to be struck by a large chunk of hail. Treat a hail strike as a Heavy Melee Weapon hit (3d6 damage). The storm may also produce lightning - once per ten-minute period, roll 1d6. On a 4-6, lightning strikes the tallest nearby structure or character holding a two-handed metal weapon. Anyone struck by lightning takes 6d6 damage and the strike counts as a flashbang grenade (CP:R page 346) centered on the struck character.');
            break;

        case 'Total Eclipse':
            mechanicalEffects.push('🌑 **Total Eclipse**: The smoke layer becomes so dense it blocks all sunlight, plunging the city into artificial night. Street lights flicker on at noon. The darkness persists until winds shift. The lack of solar heat causes temperatures to bottom out regardless of the day\'s Temperature roll - treat as Bitter Cold for the duration. Anyone who spends more than eight hours without a heat source must make a DV 15 Endurance Check or DV 15 Wilderness Survival Check. On a failure, they suffer a -2 penalty to all rolls from shivering and stiffness until they can warm up. Characters without a Cold-Weather Jacket Lining or equivalent who fail this check must also roll a Death Save. Full Body Conversions are immune to these effects.');
            break;

        case 'Freezing Rain':
            mechanicalEffects.push('🌧️ **Freezing Rain**: Supercooled rain falls through the freezing air, coating everything in a thickening layer of ice. Without both a Waterproof Jacket Lining and a Cold-Weather Jacket Lining, characters suffer Exposure damage (CP:R page 181) every 15 minutes of exposure. In addition, the weight of ice buildup on clothing and gear means all Worn armor without a penalty now has a penalty of -1 to REF, DEX, and MOVE. This penalty persists until the character can get indoors and allow the ice to melt (at least 30 minutes in a heated space).');
            break;

        case 'The Black Blizzard':
            mechanicalEffects.push('🌫️ **The Black Blizzard**: A shift in the wind brings the heart of the ash plume down to street level. This is not just a snowstorm - it is a blizzard of soot and frozen particulates. Sight lines beyond 2 m/yds are treated as if obscured by Smoke (CP:R page 180). Because this is an Ash Storm as much as a Blizzard, anyone without Nasal Filters, an Anti-Smog Breathing Mask, or similar protection suffers the Foreign Object Critical Injury (CP:R page 187) after 5 minutes of exposure as ash clogs their lungs and sinuses. They do not take the initial Bonus Damage. This Critical Injury cannot be treated until the character leaves the storm. The rules for Exposure (CP:R page 181) also apply - without cold-weather gear, characters take Exposure damage every 15 minutes.');
            break;

        case 'Eye of the Storm':
            mechanicalEffects.push('✨ **Eye of the Storm**: A strong Pacific breeze momentarily pushes the smoke layer back over the inland mountains, allowing clean, white precipitation to fall. This is fresh powder from the north - untouched by the ash, untainted by the city\'s poison sky. The air is breathable. The snow is safe to touch. For a few precious hours, Night City looks almost beautiful. Your children could play in it and they wouldn\'t even get sick. The Eye never lasts. Enjoy it while you can.');
            break;
    }
    
    // Add mechanical effects if any exist
    if (mechanicalEffects.length > 0) {
        embed.addFields({ 
            name: '❗ ADVISORY', 
            value: mechanicalEffects.join('\n\n'), 
            inline: false 
        });
    }
    
    return embed;
}

// Command handling
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    if (message.content.toLowerCase() === '!weather') {
        const weather = rollWeather();
        const embed = createWeatherEmbed(weather);
        await message.channel.send({ embeds: [embed] });
    }
    
    if (message.content.toLowerCase() === '!weather help') {
        const ashBlockStatus = isAshBlockActive() ? '🟢 ACTIVE' : '⚪ Inactive';
        const helpEmbed = new EmbedBuilder()
            .setTitle('🤖 Night City Weather Bot Commands')
            .setColor('#00BFFF')
            .addFields(
                { name: '!weather', value: 'Roll current weather conditions' },
                { name: '!weather force [condition] [days]', value: 'Force an ongoing weather event (Admin only)' },
                { name: '!weather ashblock on', value: 'Enable Ash-Block special event mode' },
                { name: '!weather ashblock off', value: 'Disable Ash-Block mode (return to seasonal tables)' },
                { name: '!weather ashblock status', value: 'Check current Ash-Block mode status' },
                { name: 'Daily Posts', value: 'Bot automatically posts weather at 8 AM daily' },
                { name: 'Ash-Block Status', value: ashBlockStatus, inline: true }
            )
            .setDescription('Based on the official Night City Weather tables from Cyberpunk RED');

        await message.channel.send({ embeds: [helpEmbed] });
    }

    // Ash-Block toggle commands
    if (message.content.toLowerCase() === '!weather ashblock on') {
        saveAshBlockState(true);
        await message.channel.send('🌫️ **Ash-Block Event ACTIVATED** • Weather reports will now use the special Ash-Block tables with winter storm conditions.');
    }

    if (message.content.toLowerCase() === '!weather ashblock off') {
        saveAshBlockState(false);
        await message.channel.send('☀️ **Ash-Block Event DEACTIVATED** • Weather reports will return to normal seasonal tables.');
    }

    if (message.content.toLowerCase() === '!weather ashblock status') {
        const status = isAshBlockActive();
        if (status) {
            await message.channel.send('🌫️ **Ash-Block Mode:** 🟢 ACTIVE\nWeather is using the special Ash-Block winter event tables.');
        } else {
            await message.channel.send('☀️ **Ash-Block Mode:** ⚪ Inactive\nWeather is using normal seasonal tables.');
        }
    }
    
    // Force ongoing weather command
    if (message.content.toLowerCase().startsWith('!weather force ')) {
        const args = message.content.slice(15).split(' '); // Remove "!weather force "
        
        if (args.length >= 2) {
            const days = parseInt(args[args.length - 1]); // Last argument should be days
            const condition = args.slice(0, -1).join(' '); // Everything except last argument
            
            if (!isNaN(days) && days > 0) {
                addOngoingEvent(condition, `${days} Days`);
                await message.channel.send(`✅ Added ongoing weather: **${condition}** for ${days} days`);
            } else {
                await message.channel.send('❌ Invalid format. Use: `!weather force [condition] [days]`\nExample: `!weather force Blood Rain 4`');
            }
        } else {
            await message.channel.send('❌ Invalid format. Use: `!weather force [condition] [days]`\nExample: `!weather force Deadly Thunderstorm 4`');
        }
    }
});

// Daily weather posting (8 AM every day)
cron.schedule('0 8 * * *', async () => {
    const weather = rollWeather();
    const embed = createWeatherEmbed(weather);
    
    // Find the channel to post in
    const channelId = process.env.CHANNEL_ID;
    const channel = client.channels.cache.get(channelId);
    
    if (channel) {
        await channel.send({ 
            content: '🌅 **Good morning, Night City!** Here\'s your daily weather report:', 
            embeds: [embed] 
        });
    }
});

client.on('ready', () => {
    console.log(`${client.user.tag} is online and ready to report Night City weather!`);
});

// Use environment variable for bot token
client.login(process.env.BOT_TOKEN);
