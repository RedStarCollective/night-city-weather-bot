const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// File to store ongoing weather events
const EVENTS_FILE = path.join(__dirname, 'ongoing_events.json');

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
    
    return { temperature, condition, duration, season };
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
    const year = 2047; // Just set year to 2047
    
    const formattedDate = `${dayName}, ${monthName} ${date}, ${year}`;
    
    // Get active ongoing events
    const ongoingEvents = getActiveOngoingEvents();
    
    const embed = new EmbedBuilder()
        .setTitle('🏙️ NCWR - NIGHT CITY WEATHER REPORT')
        .setColor(weather.condition.includes('Blood') ? '#FF0000' : 
                 weather.condition.includes('Acid') ? '#FFFF00' :
                 weather.condition.includes('Storm') ? '#800080' : 
                 weather.condition.includes('Radioactive') ? '#00FF00' :
                 '#00BFFF')
        .addFields(
            { name: 'BROADCAST DATE', value: `${formattedDate}`, inline: false },
            { name: '🌡️ TEMPERATURE', value: weather.temperature, inline: true },
            { name: '☁️ CONDITIONS', value: weather.condition, inline: true },
            { name: '\u200b', value: '\u200b', inline: true } // Spacer
        )
        .setFooter({ 
            text: `NCWR • ${weather.season.charAt(0).toUpperCase() + weather.season.slice(1)} • Time of the Red`
        })
        .setTimestamp();
    
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
    
    if (broadcastDescription) {
        embed.setDescription(broadcastDescription);
    }
    
    // Temperature mechanical effects
    let mechanicalEffects = [];
    
    if (weather.temperature.includes('Cold (Around 35°F') || weather.temperature.includes('Cold (Around 40°F')) {
        mechanicalEffects.push('❄️ **Cold Temperature**: The temperature is below normal tolerance limits for the average person. Anyone who spends most of the day outside or inside but in non-heated environment without proper protective gear suffers damage via Exposure (CP:R page 181). [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
    }
    
    if (weather.temperature.includes('Hot (Around')) {
        mechanicalEffects.push('🔥 **Hot Temperature**: The temperature has risen to an uncomfortable degree. Increase any preexisting Armor Penalty to REF, DEX, and MOVE by 1. For example, a -2 penalty becomes a -3 penalty. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)');
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
    }
    
    // Add mechanical effects if any exist
    if (mechanicalEffects.length > 0) {
        embed.addFields({ 
            name: '❗ ADVISORY', 
            value: mechanicalEffects.join('\n\n'), 
            inline: false 
        });
    }
    
    // Add separator before ongoing event
    embed.addFields({ 
        name: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬', 
        value: '\u200b', 
        inline: false 
    });
    
    // Add ongoing event information at the bottom
    embed.addFields({ 
        name: '⚡ ONGOING EVENT', 
        value: 'Intermittent blackouts continue to affect **Little Europe**, **Old Japantown**, **The Glen**, **Little China**, **University District**, and **Upper Marina** (bordering the Hot Zone). Citizens in these areas should expect power fluctuations and prepare accordingly.\n\n**Blackout Effects**: While not an actual weather condition, loss of power, CitiNet access, and communications often happens due to extreme meteorological activity. For the duration of the outage, any building in the area without a generator won\'t have electricity and Agents won\'t be able to make calls or connect to the Data Pool. [(NCW)](https://rtalsoriangames.com/wp-content/uploads/2021/07/RTG-CPR-NightCityWeather.pdf)', 
        inline: false 
    });
    
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
        const helpEmbed = new EmbedBuilder()
            .setTitle('🤖 Night City Weather Bot Commands')
            .setColor('#00BFFF')
            .addFields(
                { name: '!weather', value: 'Roll current weather conditions' },
                { name: 'Daily Posts', value: 'Bot automatically posts weather at 8 AM daily' }
            )
            .setDescription('Based on the official Night City Weather tables from Cyberpunk RED');
        
        await message.channel.send({ embeds: [helpEmbed] });
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
