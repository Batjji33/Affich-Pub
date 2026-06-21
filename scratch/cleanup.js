
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cyeppawyuxjlvjmpgnvr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8oqpftdX0RKpD4WPdVWBvg_IbUMafrW'; // Note: This might be a service role key if it starts with 'sb_', but usually publishable starts with 'pk_' or similar. Wait, 'sb_publishable_...' looks like a custom string or a specific format.

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function cleanup() {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString().split('T')[0];

    console.log(`Cleaning up data before ${lastWeekStr}...`);

    try {
        const { data: resData, error: resError } = await supabase
            .from('reservations')
            .delete()
            .lt('date', lastWeekStr);
        
        if (resError) console.error('Error deleting reservations:', resError);
        else console.log('Old reservations deleted.');

        const { data: tempData, error: tempError } = await supabase
            .from('temporary_hours')
            .delete()
            .lt('date', lastWeekStr);

        if (tempError) console.error('Error deleting temporary_hours:', tempError);
        else console.log('Old temporary_hours deleted.');

    } catch (err) {
        console.error('Cleanup failed:', err);
    }
}

cleanup();
